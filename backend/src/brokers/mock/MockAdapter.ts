import {
  IBrokerAdapter,
  InstrumentDTO,
  QuoteDTO,
  OHLCBarDTO,
  OptionChainRowDTO,
  TickListener,
} from "../IBrokerAdapter";

/**
 * Simulated random-walk price feed - no broker account needed. This is the
 * default (BROKER_PROVIDER=MOCK) so the whole app runs and can be demoed
 * immediately after `npm install`, before anyone has wired up real broker
 * credentials. Swap to ZERODHA / UPSTOX / ANGELONE once you have API keys
 * (see docs/BROKER_API_SETUP.md).
 */
export class MockAdapter implements IBrokerAdapter {
  readonly providerName = "MOCK";
  private prices: Map<string, number> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  private static SEED_INSTRUMENTS: InstrumentDTO[] = [
    { instrumentToken: "256265", tradingSymbol: "NIFTY 50", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05 },
    { instrumentToken: "738561", tradingSymbol: "RELIANCE", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "RELIANCE" },
    { instrumentToken: "2953217", tradingSymbol: "TCS", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "TCS" },
    { instrumentToken: "1270529", tradingSymbol: "HDFCBANK", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "HDFCBANK" },
    { instrumentToken: "5633", tradingSymbol: "INFY", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "INFY" },
  ];

  private static SEED_PRICES: Record<string, number> = {
    "256265": 24500,
    "738561": 2950,
    "2953217": 4150,
    "1270529": 1650,
    "5633": 1850,
  };

  async authenticate(): Promise<{ accessToken: string }> {
    return { accessToken: "mock-token" };
  }

  setPrice(instrumentToken: string, price: number): void {
    this.prices.set(instrumentToken, price);
  }

  async getInstruments(): Promise<InstrumentDTO[]> {
    return MockAdapter.SEED_INSTRUMENTS;
  }

  async getQuote(instrumentTokens: string[]): Promise<QuoteDTO[]> {
    return instrumentTokens.map((token) => {
      const base = this.prices.get(token) ?? MockAdapter.SEED_PRICES[token] ?? 1000;
      return {
        instrumentToken: token,
        lastPrice: round2(base),
        open: round2(base * 0.99),
        high: round2(base * 1.01),
        low: round2(base * 0.98),
        close: round2(base * 0.995),
        volume: Math.floor(Math.random() * 1_000_000),
        timestamp: new Date().toISOString(),
      };
    });
  }

  async getHistoricalData(
    instrumentToken: string,
    _interval: string,
    from: string,
    to: string
  ): Promise<OHLCBarDTO[]> {
    const bars: OHLCBarDTO[] = [];
    let price = MockAdapter.SEED_PRICES[instrumentToken] ?? 1000;
    const start = new Date(from).getTime();
    const end = new Date(to).getTime();
    const step = Math.max((end - start) / 100, 60000);
    for (let t = start; t <= end; t += step) {
      const open = price;
      price = price * (1 + (Math.random() - 0.5) * 0.01);
      const close = price;
      bars.push({
        timestamp: new Date(t).toISOString(),
        open: round2(open),
        close: round2(close),
        high: round2(Math.max(open, close) * 1.002),
        low: round2(Math.min(open, close) * 0.998),
        volume: Math.floor(Math.random() * 100000),
      });
    }
    return bars;
  }

  async getOptionChain(underlyingToken: string): Promise<OptionChainRowDTO[]> {
    const spot = this.prices.get(underlyingToken) ?? MockAdapter.SEED_PRICES[underlyingToken] ?? 24500;
    const rows: OptionChainRowDTO[] = [];
    for (let i = -5; i <= 5; i++) {
      const strike = Math.round((spot + i * 50) / 50) * 50;
      const intrinsicCall = Math.max(spot - strike, 0);
      const intrinsicPut = Math.max(strike - spot, 0);
      rows.push({
        strike,
        call: {
          instrumentToken: `${underlyingToken}-${strike}-CE`,
          lastPrice: round2(intrinsicCall + Math.random() * 20 + 5),
          open: 0,
          high: 0,
          low: 0,
          close: 0,
          volume: Math.floor(Math.random() * 50000),
          oi: Math.floor(Math.random() * 500000),
          timestamp: new Date().toISOString(),
        },
        put: {
          instrumentToken: `${underlyingToken}-${strike}-PE`,
          lastPrice: round2(intrinsicPut + Math.random() * 20 + 5),
          open: 0,
          high: 0,
          low: 0,
          close: 0,
          volume: Math.floor(Math.random() * 50000),
          oi: Math.floor(Math.random() * 500000),
          timestamp: new Date().toISOString(),
        },
      });
    }
    return rows;
  }

  async subscribeTicks(instrumentTokens: string[], onTick: TickListener): Promise<void> {
    for (const token of instrumentTokens) {
      if (this.timers.has(token)) continue;
      if (!this.prices.has(token)) {
        this.prices.set(token, MockAdapter.SEED_PRICES[token] ?? 1000);
      }
      const timer = setInterval(() => {
        const current = this.prices.get(token)!;
        const next = current * (1 + (Math.random() - 0.5) * 0.004);
        this.prices.set(token, next);
        onTick({
          instrumentToken: token,
          lastPrice: round2(next),
          open: round2(current * 0.99),
          high: round2(current * 1.01),
          low: round2(current * 0.98),
          close: round2(current),
          volume: Math.floor(Math.random() * 1000),
          timestamp: new Date().toISOString(),
        });
      }, 1000);
      this.timers.set(token, timer);
    }
  }

  async unsubscribeTicks(instrumentTokens: string[]): Promise<void> {
    for (const token of instrumentTokens) {
      const timer = this.timers.get(token);
      if (timer) {
        clearInterval(timer);
        this.timers.delete(token);
      }
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
