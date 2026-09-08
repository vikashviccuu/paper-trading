import axios, { AxiosInstance } from "axios";
import * as crypto from "crypto";
import {
  IBrokerAdapter,
  InstrumentDTO,
  QuoteDTO,
  OHLCBarDTO,
  OptionChainRowDTO,
  TickListener,
} from "../IBrokerAdapter";

/**
 * Angel One SmartAPI adapter (REST; live ticks emulated via polling - Angel
 * One's real-time feed is a binary WebSocket protocol documented at
 * https://smartapi.angelbroking.com/docs/WebSocket2).
 *
 * Setup manual: see docs/BROKER_API_SETUP.md#angel-one-smartapi
 * Docs: https://smartapi.angelbroking.com/docs
 *
 * Auth is TOTP-based (no OAuth redirect): API key + client ID + password +
 * a time-based OTP generated from a TOTP secret you get once when enabling
 * SmartAPI on your Angel One account.
 */
export class AngelOneAdapter implements IBrokerAdapter {
  readonly providerName = "ANGELONE";
  private http: AxiosInstance;
  private pollTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private apiKey: string,
    private clientId: string,
    private password: string,
    private totpSecret: string
  ) {
    this.http = axios.create({
      baseURL: "https://apiconnect.angelone.in",
      headers: {
        "Content-Type": "application/json",
        "X-PrivateKey": apiKey,
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "127.0.0.1",
        "X-MACAddress": "00:00:00:00:00:00",
      },
    });
  }

  private generateTotp(): string {
    // RFC 6238 TOTP, 30s step, 6 digits - matches the authenticator app flow
    // Angel One asks you to set up when you enable API access.
    const { authenticator } = require("otplib");
    return authenticator.generate(this.totpSecret);
  }

  async authenticate(): Promise<{ accessToken: string }> {
    const res = await this.http.post("/rest/auth/angelbroking/user/v1/loginByPassword", {
      clientcode: this.clientId,
      password: this.password,
      totp: this.generateTotp(),
    });
    const jwt = res.data.data.jwtToken;
    this.http.defaults.headers.common["Authorization"] = `Bearer ${jwt}`;
    return { accessToken: jwt };
  }

  async getInstruments(exchange?: string): Promise<InstrumentDTO[]> {
    // Angel One publishes a combined instrument master (all exchanges) here:
    const res = await axios.get(
      "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json"
    );
    const rows = exchange ? res.data.filter((r: any) => r.exch_seg === exchange) : res.data;
    return rows.map((i: any) => ({
      instrumentToken: i.token,
      tradingSymbol: i.symbol,
      exchange: i.exch_seg,
      segment: i.instrumenttype === "FUTSTK" || i.instrumenttype === "FUTIDX" ? "FUTURES" : i.instrumenttype === "OPTSTK" || i.instrumenttype === "OPTIDX" ? "OPTIONS" : "EQUITY",
      name: i.name,
      lotSize: Number(i.lotsize) || 1,
      tickSize: Number(i.tick_size) / 100 || 0.05,
      expiry: i.expiry ? new Date(i.expiry).toISOString() : undefined,
      strike: i.strike ? Number(i.strike) / 100 : undefined,
      optionType: i.symbol?.endsWith("CE") ? "CE" : i.symbol?.endsWith("PE") ? "PE" : undefined,
    }));
  }

  async getQuote(instrumentTokens: string[]): Promise<QuoteDTO[]> {
    const res = await this.http.post("/rest/secure/angelbroking/market/v1/quote/", {
      mode: "FULL",
      exchangeTokens: { NSE: instrumentTokens },
    });
    return (res.data.data.fetched as any[]).map((q) => ({
      instrumentToken: q.symbolToken,
      lastPrice: q.ltp,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.tradeVolume,
      timestamp: new Date().toISOString(),
    }));
  }

  async getHistoricalData(
    instrumentToken: string,
    interval: "minute" | "5minute" | "15minute" | "day",
    from: string,
    to: string
  ): Promise<OHLCBarDTO[]> {
    const intervalMap: Record<string, string> = {
      minute: "ONE_MINUTE",
      "5minute": "FIVE_MINUTE",
      "15minute": "FIFTEEN_MINUTE",
      day: "ONE_DAY",
    };
    const res = await this.http.post("/rest/secure/angelbroking/historical/v1/getCandleData", {
      exchange: "NSE",
      symboltoken: instrumentToken,
      interval: intervalMap[interval],
      fromdate: from,
      todate: to,
    });
    return (res.data.data as any[]).map((c) => ({
      timestamp: new Date(c[0]).toISOString(),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));
  }

  async getOptionChain(underlyingToken: string, expiry: string): Promise<OptionChainRowDTO[]> {
    // SmartAPI has no dedicated option-chain endpoint; build it the same way
    // as the Zerodha adapter, from the instrument master + batched quotes.
    const all = await this.getInstruments("NFO");
    const legs = all.filter((i) => i.name === underlyingToken && i.expiry?.startsWith(expiry));
    const tokens = legs.map((l) => l.instrumentToken);
    const quotes = await this.getQuote(tokens);
    const byToken = new Map(quotes.map((q) => [q.instrumentToken, q]));
    const byStrike = new Map<number, OptionChainRowDTO>();
    for (const leg of legs) {
      if (leg.strike == null) continue;
      const row = byStrike.get(leg.strike) ?? { strike: leg.strike };
      const q = byToken.get(leg.instrumentToken);
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
