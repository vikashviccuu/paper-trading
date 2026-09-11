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
    // Benchmark Indices
    { instrumentToken: "256265", tradingSymbol: "NIFTY 50", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "NIFTY 50" },
    { instrumentToken: "260105", tradingSymbol: "BANKNIFTY", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "NIFTY BANK" },
    { instrumentToken: "257801", tradingSymbol: "FINNIFTY", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "NIFTY FIN SERVICE" },
    { instrumentToken: "288009", tradingSymbol: "MIDCAP", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "NIFTY MIDCAP SELECT" },
    { instrumentToken: "264969", tradingSymbol: "INDIA VIX", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "INDIA VIX" },

    // Top Large Cap Equities
    { instrumentToken: "738561", tradingSymbol: "RELIANCE", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "RELIANCE INDUSTRIES LTD" },
    { instrumentToken: "2953217", tradingSymbol: "TCS", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "TATA CONSULTANCY SERVICES" },
    { instrumentToken: "1270529", tradingSymbol: "HDFCBANK", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "HDFC BANK LTD" },
    { instrumentToken: "5633", tradingSymbol: "INFY", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "INFOSYS LTD" },
    { instrumentToken: "1270529", tradingSymbol: "ICICIBANK", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "ICICI BANK LTD" },
    { instrumentToken: "779521", tradingSymbol: "SBIN", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "STATE BANK OF INDIA" },
    { instrumentToken: "2714625", tradingSymbol: "BHARTIARTL", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "BHARTI AIRTEL LTD" },
    { instrumentToken: "424961", tradingSymbol: "ITC", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "ITC LTD" },
    { instrumentToken: "2939649", tradingSymbol: "LT", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "LARSEN & TOUBRO LTD" },
    { instrumentToken: "492033", tradingSymbol: "KOTAKBANK", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "KOTAK MAHINDRA BANK" },
    { instrumentToken: "1510401", tradingSymbol: "AXISBANK", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "AXIS BANK LTD" },
    { instrumentToken: "356865", tradingSymbol: "HINDUNILVR", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "HINDUSTAN UNILEVER LTD" },
    { instrumentToken: "81153", tradingSymbol: "BAJFINANCE", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "BAJAJ FINANCE LTD" },
    { instrumentToken: "2815745", tradingSymbol: "MARUTI", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "MARUTI SUZUKI INDIA LTD" },
    { instrumentToken: "857857", tradingSymbol: "SUNPHARMA", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "SUN PHARMACEUTICAL IND" },
    { instrumentToken: "897665", tradingSymbol: "TITAN", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "TITAN COMPANY LTD" },
    { instrumentToken: "884737", tradingSymbol: "TMPV", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "TATA MOTORS PASS VEH" },
    { instrumentToken: "194504193", tradingSymbol: "TMCV", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "TATA MOTORS" },
    { instrumentToken: "895745", tradingSymbol: "TATASTEEL", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "TATA STEEL LTD" },
    { instrumentToken: "969473", tradingSymbol: "WIPRO", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "WIPRO LTD" },
    { instrumentToken: "1850625", tradingSymbol: "HCLTECH", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "HCL TECHNOLOGIES LTD" },
    { instrumentToken: "519937", tradingSymbol: "M&M", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "MAHINDRA & MAHINDRA" },
    { instrumentToken: "6401", tradingSymbol: "ADANIENT", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "ADANI ENTERPRISES LTD" },
    { instrumentToken: "3861249", tradingSymbol: "ADANIPORTS", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "ADANI PORTS & SEZ" },
    { instrumentToken: "5215745", tradingSymbol: "COALINDIA", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "COAL INDIA LTD" },
    { instrumentToken: "4267265", tradingSymbol: "BAJAJ-AUTO", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "BAJAJ AUTO LTD" },
    { instrumentToken: "2977281", tradingSymbol: "NTPC", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "NTPC LTD" },
    { instrumentToken: "3834113", tradingSymbol: "POWERGRID", exchange: "NSE", segment: "EQUITY", lotSize: 1, tickSize: 0.05, name: "POWER GRID CORP OF INDIA" },

    // F&O (NFO) Futures & Options
    { instrumentToken: "1000001", tradingSymbol: "NIFTY26SEPFUT", exchange: "NFO", segment: "FUTURES", lotSize: 25, tickSize: 0.05, name: "NIFTY FUT" },
    { instrumentToken: "1000002", tradingSymbol: "BANKNIFTY26SEPFUT", exchange: "NFO", segment: "FUTURES", lotSize: 15, tickSize: 0.05, name: "BANKNIFTY FUT" },
    { instrumentToken: "1000003", tradingSymbol: "NIFTY2691524500CE", exchange: "NFO", segment: "OPTIONS", lotSize: 25, tickSize: 0.05, strike: 24500, optionType: "CE", name: "NIFTY 24500 CALL" },
    { instrumentToken: "1000004", tradingSymbol: "NIFTY2691524500PE", exchange: "NFO", segment: "OPTIONS", lotSize: 25, tickSize: 0.05, strike: 24500, optionType: "PE", name: "NIFTY 24500 PUT" },
    { instrumentToken: "1000005", tradingSymbol: "BANKNIFTY2691552000CE", exchange: "NFO", segment: "OPTIONS", lotSize: 15, tickSize: 0.05, strike: 52000, optionType: "CE", name: "BANKNIFTY 52000 CALL" },
    { instrumentToken: "1000006", tradingSymbol: "BANKNIFTY2691552000PE", exchange: "NFO", segment: "OPTIONS", lotSize: 15, tickSize: 0.05, strike: 52000, optionType: "PE", name: "BANKNIFTY 52000 PUT" },

    // MCX Commodities
    { instrumentToken: "2000001", tradingSymbol: "CRUDEOIL", exchange: "MCX", segment: "FUTURES", lotSize: 100, tickSize: 1.0, name: "CRUDE OIL" },
    { instrumentToken: "2000002", tradingSymbol: "GOLD", exchange: "MCX", segment: "FUTURES", lotSize: 1, tickSize: 1.0, name: "GOLD" },
    { instrumentToken: "2000003", tradingSymbol: "SILVER", exchange: "MCX", segment: "FUTURES", lotSize: 30, tickSize: 1.0, name: "SILVER" },
    { instrumentToken: "2000004", tradingSymbol: "NATURALGAS", exchange: "MCX", segment: "FUTURES", lotSize: 1250, tickSize: 0.1, name: "NATURAL GAS" },
  ];

  private static SEED_PRICES: Record<string, number> = {
    "256265": 24500,
    "260105": 52100,
    "257801": 23400,
    "288009": 12800,
    "264969": 13.5,
    "738561": 2950,
    "2953217": 4150,
    "1270529": 1650,
    "5633": 1850,
    "779521": 810,
    "2714625": 1420,
    "424961": 490,
    "2939649": 3550,
    "492033": 1780,
    "1510401": 1150,
    "356865": 2720,
    "81153": 7250,
    "2815745": 12100,
    "857857": 1750,
    "897665": 3380,
    "884737": 980,
    "194504193": 980,
    "895745": 155,
    "969473": 490,
    "1850625": 1680,
    "519937": 2850,
    "6401": 2980,
    "3861249": 1380,
    "5215745": 475,
    "4267265": 9450,
    "2977281": 385,
    "3834113": 315,
    "1000001": 24550,
    "1000002": 52200,
    "1000003": 180,
    "1000004": 145,
    "1000005": 320,
    "1000006": 280,
    "2000001": 6150,
    "2000002": 73500,
    "2000003": 87500,
    "2000004": 195,
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
      const base = round2(this.prices.get(token) ?? MockAdapter.SEED_PRICES[token] ?? 1000);
      const open = round2(base * 0.99);
      const high = round2(base * 1.01);
      const low = round2(base * 0.98);
      const close = round2(base * 0.995);
      const netChange = round2(base - close);
      const changePercent = close > 0 ? round2((netChange / close) * 100) : 0;
      const spread = Math.max(round2(base * 0.0005), 0.05);

      return {
        instrumentToken: token,
        tradingSymbol: token.includes(":") ? token.split(":")[1] : token,
        lastPrice: base,
        lastQuantity: Math.floor(1 + Math.random() * 50),
        lastTradeTime: new Date().toISOString(),
        averagePrice: round2((open + high + low + base) / 4),
        open,
        high,
        low,
        close,
        volume: Math.floor(Math.random() * 1_000_000),
        buyQuantity: 50000 + Math.floor(Math.random() * 20000),
        sellQuantity: 48000 + Math.floor(Math.random() * 20000),
        netChange,
        changePercent,
        oi: 120000,
        oiDayHigh: 150000,
        oiDayLow: 95000,
        lowerCircuitLimit: round2(close * 0.9),
        upperCircuitLimit: round2(close * 1.1),
        depth: {
          buy: [1, 2, 3, 4, 5].map((lvl) => ({
            price: round2(base - lvl * spread),
            quantity: Math.floor(100 + Math.random() * 500),
            orders: Math.floor(1 + Math.random() * 6),
          })),
          sell: [1, 2, 3, 4, 5].map((lvl) => ({
            price: round2(base + lvl * spread),
            quantity: Math.floor(100 + Math.random() * 500),
            orders: Math.floor(1 + Math.random() * 6),
          })),
        },
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
