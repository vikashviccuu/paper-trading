import axios, { AxiosInstance } from "axios";
import { ILiveTradingAdapter, LiveOrderRequest, LiveOrderResult, LiveOrderStatusResult, LivePositionDTO, LiveHoldingDTO } from "./ILiveTradingAdapter";

/**
 * Angel One SmartAPI - real order placement. Same base URL / required
 * X-Private-Key etc. headers as brokers/angelone/AngelOneAdapter.ts, but
 * `accessToken` here is the per-user JWT SmartAPI issues after its
 * TOTP-based login (see AngelOneAdapter.authenticate) - read from that
 * user's BrokerLink, never a shared credential.
 *
 * Same SEBI Feb 2025 circular caveat as ZerodhaLiveTradingAdapter.ts applies
 * - see docs/LIVE_TRADING.md.
 *
 * Docs: https://smartapi.angelbroking.com/docs/Orders
 */
export class AngelOneLiveTradingAdapter implements ILiveTradingAdapter {
  readonly providerName = "ANGELONE";

  constructor(private apiKey: string) {}

  private client(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: "https://apiconnect.angelone.in",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-PrivateKey": this.apiKey,
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "127.0.0.1",
        "X-MACAddress": "00:00:00:00:00:00",
      },
    });
  }

  async placeOrder(accessToken: string, order: LiveOrderRequest): Promise<LiveOrderResult> {
    const http = this.client(accessToken);
    const res = await http.post("/rest/secure/angelbroking/order/v1/placeOrder", {
      variety: "NORMAL",
      tradingsymbol: order.tradingSymbol,
      symboltoken: order.tradingSymbol, // Angel One keys orders off symboltoken, not the plain trading symbol - caller passes the resolved token via tradingSymbol
      transactiontype: order.transactionType,
      exchange: order.exchange,
      ordertype: mapOrderType(order.orderType),
      producttype: order.productType, // e.g. "INTRADAY" | "DELIVERY" | "CARRYFORWARD"
      duration: "DAY",
      price: order.price ?? 0,
      triggerprice: order.triggerPrice ?? 0,
      quantity: order.quantity,
      ordertag: order.algoId,
    });
    const orderId = res.data?.data?.orderid;
    return { brokerOrderId: String(orderId), status: "SUBMITTED", raw: res.data };
  }

  async modifyOrder(accessToken: string, brokerOrderId: string, changes: Partial<LiveOrderRequest>): Promise<LiveOrderResult> {
    const http = this.client(accessToken);
    const res = await http.post("/rest/secure/angelbroking/order/v1/modifyOrder", {
      variety: "NORMAL",
      orderid: brokerOrderId,
      quantity: changes.quantity,
      price: changes.price,
      triggerprice: changes.triggerPrice,
      ordertype: changes.orderType ? mapOrderType(changes.orderType) : undefined,
      duration: "DAY",
    });
    return { brokerOrderId, status: "OPEN", raw: res.data };
  }

  async cancelOrder(accessToken: string, brokerOrderId: string): Promise<LiveOrderResult> {
    const http = this.client(accessToken);
    const res = await http.post("/rest/secure/angelbroking/order/v1/cancelOrder", {
      variety: "NORMAL",
      orderid: brokerOrderId,
    });
    return { brokerOrderId, status: "CANCELLED", raw: res.data };
  }

  async getOrderStatus(accessToken: string, brokerOrderId: string): Promise<LiveOrderStatusResult> {
    const http = this.client(accessToken);
    const res = await http.get("/rest/secure/angelbroking/order/v1/getOrderBook");
    const order = (res.data?.data ?? []).find((o: any) => o.orderid === brokerOrderId) ?? {};
    return {
      brokerOrderId,
      status: mapAngelStatus(order.status),
      filledQuantity: Number(order.filledshares ?? 0),
      averageFillPrice: order.averageprice ? Number(order.averageprice) : undefined,
      rejectionReason: order.status === "rejected" ? order.text : undefined,
      raw: order,
    };
  }

  async getPositions(accessToken: string): Promise<LivePositionDTO[]> {
    const http = this.client(accessToken);
    const res = await http.get("/rest/secure/angelbroking/order/v1/getPosition");
    return (res.data?.data ?? []).map((p: any) => ({
      tradingSymbol: p.tradingsymbol,
      exchange: p.exchange,
      productType: p.producttype,
      quantity: Number(p.netqty),
      averagePrice: Number(p.avgnetprice),
      lastPrice: p.ltp ? Number(p.ltp) : undefined,
      pnl: p.pnl ? Number(p.pnl) : undefined,
    }));
  }

  async getHoldings(accessToken: string): Promise<LiveHoldingDTO[]> {
    const http = this.client(accessToken);
    const res = await http.get("/rest/secure/angelbroking/portfolio/v1/getHolding");
    return (res.data?.data ?? []).map((h: any) => ({
      tradingSymbol: h.tradingsymbol,
      exchange: h.exchange,
      quantity: Number(h.quantity),
      averagePrice: Number(h.averageprice),
      lastPrice: h.ltp ? Number(h.ltp) : undefined,
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
      return "STOPLOSS_LIMIT";
    case "SL_M":
      return "STOPLOSS_MARKET";
    default:
      return "MARKET";
  }
}

function mapAngelStatus(status: string): string {
  if (!status) return "UNKNOWN";
  const s = String(status).toLowerCase();
  if (s.includes("complete")) return "COMPLETE";
  if (s.includes("reject")) return "REJECTED";
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("open") || s.includes("pending") || s.includes("trigger")) return "OPEN";
  return s.toUpperCase();
}
