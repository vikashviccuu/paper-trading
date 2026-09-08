import axios, { AxiosInstance } from "axios";
import { ILiveTradingAdapter, LiveOrderRequest, LiveOrderResult, LiveOrderStatusResult, LivePositionDTO, LiveHoldingDTO } from "./ILiveTradingAdapter";

/**
 * Upstox API v2 - real order placement. Same base URL / bearer-token
 * convention as brokers/upstox/UpstoxAdapter.ts, but this adapter is
 * instantiated per call with the calling user's own BrokerLink access token.
 *
 * Same SEBI Feb 2025 circular caveat as ZerodhaLiveTradingAdapter.ts applies
 * - see docs/LIVE_TRADING.md.
 *
 * Docs: https://upstox.com/developer/api-documentation/place-order
 */
export class UpstoxLiveTradingAdapter implements ILiveTradingAdapter {
  readonly providerName = "UPSTOX";

  private client(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: "https://api.upstox.com/v2",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
  }

  async placeOrder(accessToken: string, order: LiveOrderRequest): Promise<LiveOrderResult> {
    const http = this.client(accessToken);
    const res = await http.post("/order/place", {
      quantity: order.quantity,
      product: order.productType, // e.g. "I" (intraday) | "D" (delivery)
      validity: "DAY",
      price: order.price ?? 0,
      tag: order.algoId,
      instrument_token: order.tradingSymbol, // Upstox order placement keys off instrument_key, not a plain symbol - caller passes it via tradingSymbol
      order_type: mapOrderType(order.orderType),
      transaction_type: order.transactionType,
      disclosed_quantity: 0,
      trigger_price: order.triggerPrice ?? 0,
      is_amo: false,
    });
    const orderId = res.data?.data?.order_id ?? res.data?.data?.order_ids?.[0];
    return { brokerOrderId: String(orderId), status: "SUBMITTED", raw: res.data };
  }

  async modifyOrder(accessToken: string, brokerOrderId: string, changes: Partial<LiveOrderRequest>): Promise<LiveOrderResult> {
    const http = this.client(accessToken);
    const res = await http.put("/order/modify", {
      order_id: brokerOrderId,
      quantity: changes.quantity,
      price: changes.price,
      trigger_price: changes.triggerPrice,
      order_type: changes.orderType ? mapOrderType(changes.orderType) : undefined,
      validity: "DAY",
    });
    return { brokerOrderId, status: "OPEN", raw: res.data };
  }

  async cancelOrder(accessToken: string, brokerOrderId: string): Promise<LiveOrderResult> {
    const http = this.client(accessToken);
    const res = await http.delete("/order/cancel", { params: { order_id: brokerOrderId } });
    return { brokerOrderId, status: "CANCELLED", raw: res.data };
  }

  async getOrderStatus(accessToken: string, brokerOrderId: string): Promise<LiveOrderStatusResult> {
    const http = this.client(accessToken);
    const res = await http.get("/order/details", { params: { order_id: brokerOrderId } });
    const d = res.data?.data ?? {};
    return {
      brokerOrderId,
      status: mapUpstoxStatus(d.status),
      filledQuantity: Number(d.filled_quantity ?? 0),
      averageFillPrice: d.average_price ? Number(d.average_price) : undefined,
      rejectionReason: d.status === "rejected" ? d.status_message : undefined,
      raw: res.data,
    };
  }

  async getPositions(accessToken: string): Promise<LivePositionDTO[]> {
    const http = this.client(accessToken);
    const res = await http.get("/portfolio/short-term-positions");
    return (res.data?.data ?? []).map((p: any) => ({
      tradingSymbol: p.trading_symbol,
      exchange: p.exchange,
      productType: p.product,
      quantity: p.quantity,
      averagePrice: p.average_price,
      lastPrice: p.last_price,
      pnl: p.pnl,
    }));
  }

  async getHoldings(accessToken: string): Promise<LiveHoldingDTO[]> {
    const http = this.client(accessToken);
    const res = await http.get("/portfolio/long-term-holdings");
    return (res.data?.data ?? []).map((h: any) => ({
      tradingSymbol: h.trading_symbol,
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

function mapUpstoxStatus(status: string): string {
  if (!status) return "UNKNOWN";
  const s = String(status).toLowerCase();
  if (s.includes("complete")) return "COMPLETE";
  if (s.includes("reject")) return "REJECTED";
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("open") || s.includes("trigger pending")) return "OPEN";
  return s.toUpperCase();
}
