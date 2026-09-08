import axios, { AxiosInstance } from "axios";
import * as crypto from "crypto";
import { ILiveTradingAdapter, LiveOrderRequest, LiveOrderResult, LiveOrderStatusResult, LivePositionDTO, LiveHoldingDTO } from "./ILiveTradingAdapter";

/**
 * ICICI Direct Breeze Connect - real order placement.
 *
 * IMPORTANT: unlike the Zerodha/Upstox/Angel One live-trading adapters
 * above (built directly against their published order-placement docs),
 * Breeze Connect's request/response field names below were NOT verified
 * against a live sandbox call in this environment - they follow Breeze's
 * generally-documented conventions (HMAC-SHA256 request signing, the field
 * names Breeze's official Python SDK uses) but should be re-checked against
 * https://api.icicidirect.com/breezeapi/documents/index.html before going
 * live, the same caveat CashfreePayoutProvider.ts and SetuKycProvider.ts
 * carry for their own less-thoroughly-verified endpoints.
 *
 * `accessToken` here is the per-user Breeze session token obtained via
 * ICICI Direct's login flow (customer logs into
 * https://secure.icicidirect.com/apiuser/login?api_key=<ICICI_BREEZE_API_KEY>,
 * copies the resulting session token) - read from that user's BrokerLink,
 * never a shared credential. Same SEBI Feb 2025 circular caveat as the
 * other live-trading adapters applies - see docs/LIVE_TRADING.md.
 */
export class IciciDirectLiveTradingAdapter implements ILiveTradingAdapter {
  readonly providerName = "ICICIDIRECT";

  constructor(private apiKey: string, private apiSecret: string) {}

  private sign(timestamp: string, body: string): string {
    return crypto.createHash("sha256").update(timestamp + body + this.apiSecret).digest("hex");
  }

  private client(accessToken: string, body: Record<string, unknown>): { http: AxiosInstance; timestamp: string; payload: string } {
    const timestamp = new Date().toISOString().split(".")[0] + ".000Z";
    const payload = JSON.stringify(body);
    const http = axios.create({
      baseURL: "https://api.icicidirect.com/breezeapi/api/v1",
      headers: {
        "Content-Type": "application/json",
        "X-Checksum": `token ${this.sign(timestamp, payload)}`,
        "X-Timestamp": timestamp,
        "X-AppKey": this.apiKey,
        "X-SessionToken": accessToken,
      },
    });
    return { http, timestamp, payload };
  }

  async placeOrder(accessToken: string, order: LiveOrderRequest): Promise<LiveOrderResult> {
    const body = {
      stock_code: order.tradingSymbol,
      exchange_code: order.exchange,
      product: order.productType, // e.g. "margin" | "cash" | "futures" | "options"
      action: order.transactionType.toLowerCase(),
      order_type: order.orderType.toLowerCase(),
      stoploss: order.triggerPrice ?? "0",
      quantity: String(order.quantity),
      price: order.price != null ? String(order.price) : "0",
      validity: "day",
      user_remark: order.algoId,
    };
    const { http, payload } = this.client(accessToken, body);
    const res = await http.post("/order", JSON.parse(payload));
    const orderId = res.data?.Success?.order_id;
    return { brokerOrderId: String(orderId), status: "SUBMITTED", raw: res.data };
  }

  async modifyOrder(accessToken: string, brokerOrderId: string, changes: Partial<LiveOrderRequest>): Promise<LiveOrderResult> {
    const body = {
      order_id: brokerOrderId,
      quantity: changes.quantity != null ? String(changes.quantity) : undefined,
      price: changes.price != null ? String(changes.price) : undefined,
      stoploss: changes.triggerPrice != null ? String(changes.triggerPrice) : undefined,
      validity: "day",
    };
    const { http, payload } = this.client(accessToken, body);
    const res = await http.put("/order", JSON.parse(payload));
    return { brokerOrderId, status: "OPEN", raw: res.data };
  }

  async cancelOrder(accessToken: string, brokerOrderId: string): Promise<LiveOrderResult> {
    const body = { order_id: brokerOrderId };
    const { http, payload } = this.client(accessToken, body);
    const res = await http.delete("/order", { data: JSON.parse(payload) });
    return { brokerOrderId, status: "CANCELLED", raw: res.data };
  }

  async getOrderStatus(accessToken: string, brokerOrderId: string): Promise<LiveOrderStatusResult> {
    const body = { order_id: brokerOrderId };
    const { http, payload } = this.client(accessToken, body);
    const res = await http.get("/order", { params: JSON.parse(payload) });
    const d = res.data?.Success?.[0] ?? {};
    return {
      brokerOrderId,
      status: mapIciciStatus(d.status),
      filledQuantity: Number(d.quantity_executed ?? 0),
      averageFillPrice: d.average_price ? Number(d.average_price) : undefined,
      rejectionReason: d.status === "Rejected" ? d.rejection_reason : undefined,
      raw: res.data,
    };
  }

  async getPositions(accessToken: string): Promise<LivePositionDTO[]> {
    const { http, payload } = this.client(accessToken, {});
    const res = await http.get("/portfoliopositions", { params: JSON.parse(payload) });
    return (res.data?.Success ?? []).map((p: any) => ({
      tradingSymbol: p.stock_code,
      exchange: p.exchange_code,
      productType: p.product_type,
      quantity: Number(p.quantity),
      averagePrice: Number(p.average_price),
      lastPrice: p.ltp ? Number(p.ltp) : undefined,
      pnl: p.pnl ? Number(p.pnl) : undefined,
    }));
  }

  async getHoldings(accessToken: string): Promise<LiveHoldingDTO[]> {
    const { http, payload } = this.client(accessToken, {});
    const res = await http.get("/portfolioholdings", { params: JSON.parse(payload) });
    return (res.data?.Success ?? []).map((h: any) => ({
      tradingSymbol: h.stock_code,
      exchange: h.exchange_code,
      quantity: Number(h.quantity),
      averagePrice: Number(h.average_price),
      lastPrice: h.ltp ? Number(h.ltp) : undefined,
    }));
  }
}

function mapIciciStatus(status: string): string {
  if (!status) return "UNKNOWN";
  const s = String(status).toLowerCase();
  if (s.includes("executed") || s.includes("complete")) return "COMPLETE";
  if (s.includes("reject")) return "REJECTED";
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("open") || s.includes("pending") || s.includes("ordered")) return "OPEN";
  return s.toUpperCase();
}
