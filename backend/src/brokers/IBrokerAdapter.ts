/**
 * Every broker (Zerodha, Upstox, Angel One, ...) is wrapped behind this single
 * interface. The rest of the app (order engine, routes, websocket gateway)
 * never talks to a broker SDK directly - only to whatever adapter is active,
 * chosen at runtime by BROKER_PROVIDER in .env (see BrokerFactory.ts).
 *
 * IMPORTANT: brokers here are used ONLY as a market-data / instrument-master
 * source, using ONE shared platform-wide credential (BROKER_PROVIDER in
 * .env). No adapter implementing *this* interface ever places a real order -
 * all order execution for PAPER and CONTEST accounts happens virtually
 * inside engine/OrderEngine.ts against the wallet and position tables. This
 * keeps that part of the product legally a simulator, matching how Neostox
 * itself operates (delayed/derived data, no real fund movement).
 *
 * Real order placement for a user's LIVE trading account is a deliberately
 * separate interface - backend/src/liveTrading/ILiveTradingAdapter.ts -
 * implemented per-broker again, but instantiated per-user with *that user's
 * own* BrokerLink credentials, never this shared one. See
 * docs/LIVE_TRADING.md.
 */

export interface InstrumentDTO {
  instrumentToken: string;
  tradingSymbol: string;
  exchange: string; // NSE | BSE | NFO | MCX
  segment: "EQUITY" | "FUTURES" | "OPTIONS";
  name?: string;
  lotSize: number;
  tickSize: number;
  expiry?: string; // ISO date, F&O only
  strike?: number; // OPTIONS only
  optionType?: "CE" | "PE";
}

export interface DepthItemDTO {
  price: number;
  quantity: number;
  orders: number;
}

export interface MarketDepthDTO {
  buy: DepthItemDTO[];
  sell: DepthItemDTO[];
}

export interface QuoteDTO {
  instrumentToken: string;
  tradingSymbol?: string;
  lastPrice: number;
  lastQuantity?: number;
  lastTradeTime?: string;
  averagePrice?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyQuantity?: number;
  sellQuantity?: number;
  netChange?: number;
  changePercent?: number;
  oi?: number;
  oiDayHigh?: number;
  oiDayLow?: number;
  lowerCircuitLimit?: number;
  upperCircuitLimit?: number;
  depth?: MarketDepthDTO;
  timestamp: string;
}

export interface OHLCBarDTO {
  timestamp: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionChainRowDTO {
  strike: number;
  call?: QuoteDTO & { oi: number; iv?: number };
  put?: QuoteDTO & { oi: number; iv?: number };
}

export type TickListener = (quote: QuoteDTO) => void;

export interface IBrokerAdapter {
  readonly providerName: string;

  /** Exchange an auth code / credentials for a usable access token. */
  authenticate(params: Record<string, string>): Promise<{ accessToken: string }>;

  /** Full (or cached) instrument master used to populate the Instrument table. */
  getInstruments(exchange?: string): Promise<InstrumentDTO[]>;

  /** One-shot quote fetch, used for order fill pricing and REST polling fallback. */
  getQuote(instrumentTokens: string[]): Promise<QuoteDTO[]>;

  /** Historical OHLC candles for charting. */
  getHistoricalData(
    instrumentToken: string,
    interval: "minute" | "5minute" | "15minute" | "day",
    from: string,
    to: string
  ): Promise<OHLCBarDTO[]>;

  /** Options chain for an underlying + expiry (F&O paper trading). */
  getOptionChain(underlyingToken: string, expiry: string): Promise<OptionChainRowDTO[]>;

  /** Subscribe to live ticks over the broker's streaming feed (WebSocket). */
  subscribeTicks(instrumentTokens: string[], onTick: TickListener): Promise<void>;

  unsubscribeTicks(instrumentTokens: string[]): Promise<void>;
}
