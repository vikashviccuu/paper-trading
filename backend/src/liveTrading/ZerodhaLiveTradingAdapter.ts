// eslint-disable-next-line @typescript-eslint/no-require-imports
const { KiteConnect } = require("kiteconnect");
import { ILiveTradingAdapter, LiveOrderRequest, LiveOrderResult, LiveOrderStatusResult, LivePositionDTO, LiveHoldingDTO } from "./ILiveTradingAdapter";

/**
 * Zerodha Kite Connect - real order placement. Uses the SAME KiteConnect npm
 * package as brokers/zerodha/ZerodhaAdapter.ts, but instantiated fresh per
 * call with the calling user's own access token (LiveOrderService reads it
 * from that user's BrokerLink) - never the shared KITE_ACCESS_TOKEN used for
 * market data.
 *
 * IMPORTANT: per SEBI's Feb 2025 algorithmic-trading circular, real
 * production use of this adapter requires OAuth-based login (not a manually
 * pasted access token), the platform being empanelled with Zerodha as a
 * registered API/algo vendor, a broker-whitelisted static IP, and Algo ID
 * tagging above the per-second order-rate threshold - see
 * docs/LIVE_TRADING.md. This adapter implements the mechanical order-call
 * shape only; it does not by itself satisfy that empanelment.
 *
 * Docs: https://kite.trade/docs/connect/v3/orders/
 */
export class ZerodhaLiveTradingAdapter implements ILiveTradingAdapter {
  readonly providerName = "ZERODHA";

  constructor(private apiKey: string) {}

  private client(accessToken: string): any {
    const kc = new KiteConnect({ api_key: this.apiKey });
    kc.setAccessToken(accessToken);
    return kc;
  }

  async placeOrder(accessToken: string, order: LiveOrderRequest): Promise<LiveOrderResult> {
    const kc = this.client(accessToken);
    const params: Record<string, any> = {
      exchange: order.exchange,
      tradingsymbol: order.tradingSymbol,
      transaction_type: order.transactionType,
      quantity: order.quantity,
      product: order.productType, // e.g. "MIS" | "CNC" | "NRML"
      order_type: mapOrderType(order.orderType),
      validity: "DAY",
    };
    if (order.price != null) params.price = order.price;
    if (order.triggerPrice != null) params.trigger_price = order.triggerPrice;
    if (order.algoId) params.tag = order.algoId; // Kite's free-text order "tag" field - see docs/LIVE_TRADING.md for the Algo ID caveat

    const res: any = await kc.placeOrder("regular" as any, params as any);
    return { brokerOrderId: String(res.order_id), status: "SUBMITTED", raw: res };
  }

  async modifyOrder(accessToken: string, brokerOrderId: string, changes: Partial<LiveOrderRequest>): Promise<LiveOrderResult> {
    const kc = this.client(accessToken);
    const params: Record<string, any> = {};
    if (changes.quantity != null) params.quantity = changes.quantity;
    if (changes.price != null) params.price = changes.price;
    if (changes.triggerPrice != null) params.trigger_price = changes.triggerPrice;
    if (changes.orderType != null) params.order_type = mapOrderType(changes.orderType);

    const res: any = await kc.modifyOrder("regular" as any, brokerOrderId, params as any);
    return { brokerOrderId: String(res.order_id ?? brokerOrderId), status: "OPEN", raw: res };
  }

  async cancelOrder(accessToken: string, brokerOrderId: string): Promise<LiveOrderResult> {
    const kc = this.client(accessToken);
    const res: any = await kc.cancelOrder("regular" as any, brokerOrderId);
    return { brokerOrderId: String(res.order_id ?? brokerOrderId), status: "CANCELLED", raw: res };
  }

  async getOrderStatus(accessToken: string, brokerOrderId: string): Promise<LiveOrderStatusResult> {
    const kc = this.client(accessToken);
    const history: any[] = await kc.getOrderHistory(brokerOrderId);
    const latest = history[history.length - 1] ?? {};
    return {
      brokerOrderId,
      status: mapKiteStatus(latest.status),
      filledQuantity: Number(latest.filled_quantity ?? 0),
      averageFillPrice: latest.average_price ? Number(latest.average_price) : undefined,
      rejectionReason: latest.status === "REJECTED" ? latest.status_message : undefined,
      raw: history,
    };
  }

  async getPositions(accessToken: string): Promise<LivePositionDTO[]> {
    const kc = this.client(accessToken);
    const positions: any = await kc.getPositions();
    const net: any[] = positions.net ?? [];
    return net.map((p) => ({
      tradingSymbol: p.tradingsymbol,
      exchange: p.exchange,
      productType: p.product,
      quantity: p.quantity,
      averagePrice: p.average_price,
      lastPrice: p.last_price,
      pnl: p.pnl,
    }));
  }

  async getHoldings(accessToken: string): Promise<LiveHoldingDTO[]> {
    const kc = this.client(accessToken);
    const holdings: any[] = await kc.getHoldings();
    return holdings.map((h) => ({
      tradingSymbol: h.tradingsymbol,
      exchange: h.exchange,
      quantity: h.quantity,
      averagePrice: h.average_price,
      lastPrice: h.last_price,
    }));
  }
}

function mapOrderType(orderType: LiveOrderRequest["orderType"]): string {
  switch (orderType) {
    case "MARKET":
      return "MARKET";
    case "LIMIT":
      return "LIMIT";
    case "SL":
      return "SL";
    case "SL_M":
      return "SL-M";
    default:
      return "MARKET";
  }
}

function mapKiteStatus(status: string): string {
  if (!status) return "UNKNOWN";
  const s = status.toUpperCase();
  if (s.includes("COMPLETE")) return "COMPLETE";
  if (s.includes("REJECT")) return "REJECTED";
  if (s.includes("CANCEL")) return "CANCELLED";
  if (s.includes("OPEN") || s.includes("TRIGGER PENDING")) return "OPEN";
  return s;
}
