import axios, { AxiosInstance } from "axios";
import {
  IBrokerAdapter,
  InstrumentDTO,
  QuoteDTO,
  OHLCBarDTO,
  OptionChainRowDTO,
  TickListener,
} from "../IBrokerAdapter";

/**
 * Upstox API v2 adapter (REST only - live tick fan-out is emulated via
 * short-interval polling of the quote endpoint; Upstox's true streaming feed
 * uses a protobuf-over-WebSocket protocol documented at
 * https://upstox.com/developer/api-documentation/market-data-feed - swap the
 * polling loop below for that feed for production-grade latency).
 *
 * Setup manual: see docs/BROKER_API_SETUP.md#upstox
 * Docs: https://upstox.com/developer/api-documentation/open-api
 */
export class UpstoxAdapter implements IBrokerAdapter {
  readonly providerName = "UPSTOX";
  private http: AxiosInstance;
  private pollTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private apiKey: string,
    private apiSecret: string,
    private redirectUri: string,
    private accessToken?: string
  ) {
    this.http = axios.create({
      baseURL: "https://api.upstox.com/v2",
      headers: this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {},
    });
  }

  /**
   * Manual OAuth flow:
   *  1. GET https://api.upstox.com/v2/login/authorization/dialog
   *       ?response_type=code&client_id=<UPSTOX_API_KEY>
   *       &redirect_uri=<UPSTOX_REDIRECT_URI>
   *  2. User logs in, Upstox redirects to redirect_uri with ?code=...
   *  3. This method exchanges that code for an access_token.
   */
  async authenticate(params: { code: string }): Promise<{ accessToken: string }> {
    const res = await axios.post(
      "https://api.upstox.com/v2/login/authorization/token",
      new URLSearchParams({
        code: params.code,
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    this.accessToken = res.data.access_token;
    this.http.defaults.headers.common["Authorization"] = `Bearer ${this.accessToken}`;
    return { accessToken: res.data.access_token };
  }

  async getInstruments(exchange = "NSE"): Promise<InstrumentDTO[]> {
    // Upstox publishes gzipped JSON instrument dumps per exchange segment:
    // https://assets.upstox.com/market-quote/instruments/exchange/<SEGMENT>.json.gz
    const url = `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json.gz`;
    const res = await axios.get(url, { responseType: "arraybuffer" });
    const zlib = await import("zlib");
    const json = JSON.parse(zlib.gunzipSync(res.data).toString("utf-8"));
    return json.map((i: any) => ({
      instrumentToken: i.instrument_key,
      tradingSymbol: i.trading_symbol,
      exchange: i.exchange,
      segment: i.instrument_type === "FUT" ? "FUTURES" : i.instrument_type === "CE" || i.instrument_type === "PE" ? "OPTIONS" : "EQUITY",
      name: i.name,
      lotSize: i.lot_size || 1,
      tickSize: i.tick_size || 0.05,
      expiry: i.expiry ? new Date(i.expiry).toISOString() : undefined,
      strike: i.strike_price ? Number(i.strike_price) : undefined,
      optionType: i.instrument_type === "CE" || i.instrument_type === "PE" ? i.instrument_type : undefined,
    }));
  }

  async getQuote(instrumentTokens: string[]): Promise<QuoteDTO[]> {
    const res = await this.http.get("/market-quote/quotes", {
      params: { instrument_key: instrumentTokens.join(",") },
    });
    return Object.values(res.data.data).map((q: any) => ({
      instrumentToken: q.instrument_token,
      lastPrice: q.last_price,
      open: q.ohlc?.open ?? 0,
      high: q.ohlc?.high ?? 0,
      low: q.ohlc?.low ?? 0,
      close: q.ohlc?.close ?? 0,
      volume: q.volume ?? 0,
      timestamp: new Date().toISOString(),
    }));
  }

  async getHistoricalData(
    instrumentToken: string,
    interval: "minute" | "5minute" | "15minute" | "day",
    from: string,
    to: string
  ): Promise<OHLCBarDTO[]> {
    const unit = interval === "day" ? "day" : "minute";
    const res = await this.http.get(
      `/historical-candle/${encodeURIComponent(instrumentToken)}/${unit}/${to}/${from}`
    );
    return (res.data.data.candles as any[]).map((c) => ({
      timestamp: new Date(c[0]).toISOString(),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));
  }

  async getOptionChain(underlyingToken: string, expiry: string): Promise<OptionChainRowDTO[]> {
    const res = await this.http.get("/option/chain", {
      params: { instrument_key: underlyingToken, expiry_date: expiry },
    });
    return (res.data.data as any[]).map((row) => ({
      strike: row.strike_price,
      call: row.call_options
        ? {
            instrumentToken: row.call_options.instrument_key,
            lastPrice: row.call_options.market_data.ltp,
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: row.call_options.market_data.volume ?? 0,
            oi: row.call_options.market_data.oi ?? 0,
            iv: row.call_options.option_greeks?.iv,
            timestamp: new Date().toISOString(),
          }
        : undefined,
      put: row.put_options
        ? {
            instrumentToken: row.put_options.instrument_key,
            lastPrice: row.put_options.market_data.ltp,
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: row.put_options.market_data.volume ?? 0,
            oi: row.put_options.market_data.oi ?? 0,
            iv: row.put_options.option_greeks?.iv,
            timestamp: new Date().toISOString(),
          }
        : undefined,
    }));
  }

  /** Polling-based emulation - see class docblock for the real WebSocket feed. */
  async subscribeTicks(instrumentTokens: string[], onTick: TickListener): Promise<void> {
    const key = instrumentTokens.join(",");
    if (this.pollTimers.has(key)) return;
    const timer = setInterval(async () => {
      try {
        const quotes = await this.getQuote(instrumentTokens);
        quotes.forEach(onTick);
      } catch {
        /* swallow transient poll errors */
      }
    }, 2000);
    this.pollTimers.set(key, timer);
  }

  async unsubscribeTicks(instrumentTokens: string[]): Promise<void> {
    const key = instrumentTokens.join(",");
    const timer = this.pollTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(key);
    }
  }
}
