/**
 * Real order placement, deliberately a separate interface from
 * backend/src/brokers/IBrokerAdapter.ts (which is market-data only and is
 * never given the ability to place an order). Implementations here are
 * instantiated PER USER with that user's own BrokerLink access token - never
 * a shared platform-wide credential - matching the self-custody execution
 * model described in docs/LIVE_TRADING.md: the platform never custodies
 * real client money, it only calls the broker's own API using the
 * individual client's own authorization.
 *
 * Selected at runtime per order via LiveTradingAdapterFactory, keyed by
 * whichever broker the caller's BrokerLink is for (not a single env-wide
 * choice like BROKER_PROVIDER, since different users can link different
 * brokers).
 */

export interface LiveOrderRequest {
  tradingSymbol: string;
  exchange: string; // NSE | BSE | NFO | MCX
  transactionType: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL_M";
  productType: string; // broker-native product code (e.g. Zerodha "MIS"/"CNC"/"NRML") - caller maps our ProductType to the right code per broker
  quantity: number;
  price?: number;
  triggerPrice?: number;
  // SEBI Feb 2025 circular: every algo/API order must carry a unique
  // exchange-issued Algo ID once a platform is properly empanelled as an
  // algo provider - see docs/LIVE_TRADING.md. Passed through as-is; adapters
  // attach it in whatever field the broker's API expects, when set.
  algoId?: string;
}

export interface LiveOrderResult {
  brokerOrderId: string;
  status: string; // broker-reported status string, normalized loosely (e.g. "OPEN", "COMPLETE", "REJECTED")
  raw: unknown; // full broker response, stored for audit (LiveOrder.rawResponse)
}

export interface LiveOrderStatusResult {
  brokerOrderId: string;
  status: string;
  filledQuantity: number;
  averageFillPrice?: number;
  rejectionReason?: string;
  raw: unknown;
}

export interface LivePositionDTO {
  tradingSymbol: string;
  exchange: string;
  productType: string;
  quantity: number;
  averagePrice: number;
  lastPrice?: number;
  pnl?: number;
}

export interface LiveHoldingDTO {
  tradingSymbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice?: number;
}

export interface ILiveTradingAdapter {
  readonly providerName: string;

  placeOrder(accessToken: string, order: LiveOrderRequest): Promise<LiveOrderResult>;

  modifyOrder(accessToken: string, brokerOrderId: string, changes: Partial<Pick<LiveOrderRequest, "quantity" | "price" | "triggerPrice" | "orderType">>): Promise<LiveOrderResult>;

  cancelOrder(accessToken: string, brokerOrderId: string): Promise<LiveOrderResult>;

  getOrderStatus(accessToken: string, brokerOrderId: string): Promise<LiveOrderStatusResult>;

  getPositions(accessToken: string): Promise<LivePositionDTO[]>;

  getHoldings(accessToken: string): Promise<LiveHoldingDTO[]>;
}
