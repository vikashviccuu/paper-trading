// eslint-disable-next-line @typescript-eslint/no-require-imports
const { KiteConnect, KiteTicker } = require("kiteconnect");
import {
  IBrokerAdapter,
  InstrumentDTO,
  QuoteDTO,
  OHLCBarDTO,
  OptionChainRowDTO,
  TickListener,
} from "../IBrokerAdapter";

/**
 * Zerodha Kite Connect adapter.
 *
 * Setup manual: see docs/BROKER_API_SETUP.md#zerodha-kite-connect
 * Docs: https://kite.trade/docs/connect/v3/
 *
 * Auth flow (manual, done once per day since Kite tokens expire daily):
 *   1. Visit https://kite.zerodha.com/connect/login?api_key=<KITE_API_KEY>&v=3
 *   2. Log in, approve the app, get redirected to your registered redirect_url
 *      with a `request_token` query param.
 *   3. POST that request_token + api_secret to /session/token to get an
 *      access_token (this adapter's `authenticate` does step 3 for you).
 *   4. Put the resulting access_token in KITE_ACCESS_TOKEN in .env, or store
 *      it against the user's BrokerLink row.
 */
export class ZerodhaAdapter implements IBrokerAdapter {
  readonly providerName = "ZERODHA";
  private kc: any;
  private ticker: any = null;
  private tickListeners: Set<TickListener> = new Set();
  private tokenToSymbol: Map<number, string> = new Map();

  constructor(private apiKey: string, private apiSecret: string, accessToken?: string) {
    this.kc = new KiteConnect({ api_key: apiKey });
    if (accessToken) this.kc.setAccessToken(accessToken);
  }

  async authenticate(params: { requestToken: string }): Promise<{ accessToken: string }> {
    const session = await this.kc.generateSession(params.requestToken, this.apiSecret);
    this.kc.setAccessToken(session.access_token);
    return { accessToken: session.access_token };
  }

  async getInstruments(exchange?: string): Promise<InstrumentDTO[]> {
    // kiteconnect returns the full daily instrument dump (CSV parsed to JSON).
    const raw = await this.kc.getInstruments(exchange as any);
    return raw
      .filter((i: any) => i && i.instrument_token)
      .map((i: any) => ({
        instrumentToken: String(i.instrument_token),
        tradingSymbol: String(i.tradingsymbol || i.name || i.instrument_token),
        exchange: String(i.exchange || "NSE"),
        segment: mapSegment(i.segment, i.instrument_type),
        name: i.name ? String(i.name) : undefined,
        lotSize: i.lot_size || 1,
        tickSize: i.tick_size || 0.05,
        expiry: i.expiry ? new Date(i.expiry).toISOString() : undefined,
        strike: i.strike ? Number(i.strike) : undefined,
        optionType: i.instrument_type === "CE" || i.instrument_type === "PE" ? i.instrument_type : undefined,
      }));
  }

  async getQuote(instrumentTokens: string[]): Promise<QuoteDTO[]> {
    const keys = instrumentTokens;
    const quotes = await this.kc.getQuote(keys);
    return Object.entries(quotes).map(([token, q]: [string, any]) => ({
      instrumentToken: token,
      tradingSymbol: q.tradingsymbol ?? token,
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
    const candles = await this.kc.getHistoricalData(Number(instrumentToken), interval, from, to);
    return candles.map((c: any) => ({
      timestamp: new Date(c.date).toISOString(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  async getOptionChain(underlyingToken: string, expiry: string): Promise<OptionChainRowDTO[]> {
    // Kite has no single "option chain" endpoint - build it from the instrument
    // master (filtered by underlying + expiry) plus a batched quote call.
    const all = await this.getInstruments("NFO");
    const legs = all.filter((i) => i.name === underlyingToken && i.expiry?.startsWith(expiry));
    const tokens = legs.map((l) => l.instrumentToken);
    const quotes = await this.getQuote(tokens);
    const quoteByToken = new Map(quotes.map((q) => [q.instrumentToken, q]));

    const byStrike = new Map<number, OptionChainRowDTO>();
    for (const leg of legs) {
      if (leg.strike == null) continue;
      const row = byStrike.get(leg.strike) ?? { strike: leg.strike };
      const q = quoteByToken.get(leg.instrumentToken);
      if (q) {
        const enriched = { ...q, oi: 0 };
        if (leg.optionType === "CE") row.call = enriched;
        if (leg.optionType === "PE") row.put = enriched;
      }
      byStrike.set(leg.strike, row);
    }
    return Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  }

  async subscribeTicks(instrumentTokens: string[], onTick: TickListener): Promise<void> {
    this.tickListeners.add(onTick);
    const numericTokens = instrumentTokens.map(Number);

    if (!this.ticker) {
      const accessToken = (this.kc as any).access_token;
      this.ticker = new KiteTicker({ api_key: this.apiKey, access_token: accessToken });
      this.ticker.on("ticks", (ticks: any[]) => {
        for (const t of ticks) {
          const quote: QuoteDTO = {
            instrumentToken: String(t.instrument_token),
            lastPrice: t.last_price,
            open: t.ohlc?.open ?? 0,
            high: t.ohlc?.high ?? 0,
            low: t.ohlc?.low ?? 0,
            close: t.ohlc?.close ?? 0,
            volume: t.volume_traded ?? 0,
            timestamp: new Date().toISOString(),
          };
          this.tickListeners.forEach((l) => l(quote));
        }
      });
      this.ticker.on("connect", () => this.ticker!.subscribe(numericTokens));
      this.ticker.connect();
    } else {
      this.ticker.subscribe(numericTokens);
    }
  }

  async unsubscribeTicks(instrumentTokens: string[]): Promise<void> {
    this.ticker?.unsubscribe(instrumentTokens.map(Number));
  }
}

function mapSegment(segment: string, instrumentType: string): "EQUITY" | "FUTURES" | "OPTIONS" {
  if (instrumentType === "CE" || instrumentType === "PE") return "OPTIONS";
  if (instrumentType === "FUT") return "FUTURES";
  return "EQUITY";
}
