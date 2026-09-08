import { prisma } from "../utils/prisma";
import { AppError } from "../engine/OrderEngine";
import { env } from "../config/env";
import { getLiveTradingAdapter } from "../liveTrading/LiveTradingAdapterFactory";
import { otpService } from "./OtpService";
import { LiveOrderRequest } from "../liveTrading/ILiveTradingAdapter";

export interface PlaceLiveOrderInput {
  tradingSymbol: string;
  exchange: string;
  instrumentToken?: string;
  transactionType: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL_M";
  productType: "INTRADAY" | "DELIVERY" | "NORMAL";
  quantity: number;
  price?: number;
  triggerPrice?: number;
  /** The phone number the fresh 2FA OTP was verified against - see requireFresh2FA below. */
  twoFactorPhone: string;
}

// Broker-native product codes differ per broker - our internal ProductType
// enum (INTRADAY/DELIVERY/NORMAL, shared with paper trading) is mapped here
// rather than exposed to the user as broker jargon.
const PRODUCT_CODE_BY_BROKER: Record<string, Record<PlaceLiveOrderInput["productType"], string>> = {
  ZERODHA: { INTRADAY: "MIS", DELIVERY: "CNC", NORMAL: "NRML" },
  UPSTOX: { INTRADAY: "I", DELIVERY: "D", NORMAL: "D" },
  ANGELONE: { INTRADAY: "INTRADAY", DELIVERY: "DELIVERY", NORMAL: "CARRYFORWARD" },
  ICICIDIRECT: { INTRADAY: "margin", DELIVERY: "cash", NORMAL: "futures" },
  MOCK: { INTRADAY: "MIS", DELIVERY: "CNC", NORMAL: "NRML" },
};

/**
 * Places, cancels, and syncs real orders for a user's LiveTradingAccount.
 * Every check below exists because of a specific requirement in
 * docs/LIVE_TRADING.md - read that doc before changing this file. In order:
 *
 *   1. Feature flag (LIVE_TRADING_ENABLED) and execution mode
 *      (LIVE_EXECUTION_MODE must be SELF_CUSTODY - PLATFORM_POOLED fails
 *      closed, see docs/LIVE_TRADING.md#execution-model).
 *   2. Account must be ENABLED (explicit opt-in) and not kill-switched.
 *   3. KYC must be VERIFIED.
 *   4. Basic pre-trade risk controls: daily order count and per-order value
 *      caps (LiveTradingAccount.dailyOrderLimit/maxOrderValue).
 *   5. Fresh per-order 2FA (OtpService, purpose LIVE_ORDER_2FA, checked
 *      within LIVE_ORDER_2FA_VALIDITY_MINUTES) - SEBI's Feb 2025 circular
 *      requires 2FA for API/algo order placement.
 *   6. Audit-first: the LiveOrder row (with an immutable rawRequest
 *      snapshot) is written BEFORE the broker call, so even a crash mid-call
 *      leaves a record - then the broker call, then a LiveOrderEvent for
 *      every state transition.
 */
export class LiveOrderService {
  async placeOrder(userId: string, input: PlaceLiveOrderInput) {
    if (!env.LIVE_TRADING_ENABLED) {
      throw new AppError(403, "Live trading is disabled on this deployment");
    }
    if (env.LIVE_EXECUTION_MODE !== "SELF_CUSTODY") {
      throw new AppError(501, "PLATFORM_POOLED execution is not implemented - see docs/LIVE_TRADING.md#execution-model");
    }

    const account = await prisma.liveTradingAccount.findUnique({ where: { userId }, include: { brokerLink: true } });
    if (!account || account.status !== "ENABLED" || !account.brokerLink) {
      throw new AppError(403, "Live trading is not enabled on your account");
    }
    if (account.killSwitchActive) {
      throw new AppError(403, "Live trading is paused (kill switch active) - resume it from your Live Trading settings first");
    }

    const kyc = await prisma.kyc.findUnique({ where: { userId } });
    if (!kyc || kyc.status !== "VERIFIED") {
      throw new AppError(403, "Complete KYC verification before placing a live order");
    }

    if (!input.tradingSymbol) {
      throw new AppError(400, "tradingSymbol is required");
    }

    await this.enforceRiskLimits(userId, account, input);
    await this.requireFresh2FA(userId, input.twoFactorPhone);

    const provider = account.brokerLink.provider;
    const productCode = PRODUCT_CODE_BY_BROKER[provider]?.[input.productType] ?? input.productType;
    const orderRequest: LiveOrderRequest = {
      tradingSymbol: input.tradingSymbol,
      exchange: input.exchange,
      transactionType: input.transactionType,
      orderType: input.orderType,
      productType: productCode,
      quantity: input.quantity,
      price: input.price,
      triggerPrice: input.triggerPrice,
      algoId: undefined, // see docs/LIVE_TRADING.md - requires real exchange empanelment before this should be populated
    };

    // Write the audit record BEFORE calling the broker, per the class docblock.
    const liveOrder = await prisma.liveOrder.create({
      data: {
        userId,
        brokerLinkId: account.brokerLink.id,
        broker: provider,
        exchange: input.exchange,
        tradingSymbol: input.tradingSymbol,
        instrumentToken: input.instrumentToken,
        transactionType: input.transactionType,
        orderType: input.orderType,
        productType: productCode,
        quantity: input.quantity,
        price: input.price,
        triggerPrice: input.triggerPrice,
        status: "PENDING_SUBMISSION",
        rawRequest: orderRequest as any,
        twoFactorVerifiedAt: new Date(),
      },
    });
    await this.logEvent(liveOrder.id, "PLACED", { orderRequest });

    try {
      const adapter = getLiveTradingAdapter(provider);
      const result = await adapter.placeOrder(account.brokerLink.accessToken ?? "", orderRequest);
      const updated = await prisma.liveOrder.update({
        where: { id: liveOrder.id },
        data: { brokerOrderId: result.brokerOrderId, status: mapStatus(result.status), rawResponse: result.raw as any },
      });
      await this.logEvent(liveOrder.id, "BROKER_ACK", { result });
      return updated;
    } catch (err: any) {
      const rejected = await prisma.liveOrder.update({
        where: { id: liveOrder.id },
        data: { status: "REJECTED", rejectionReason: err?.response?.data?.message ?? err?.message ?? "Broker rejected the order" },
      });
      await this.logEvent(liveOrder.id, "REJECTED", { error: err?.response?.data ?? err?.message });
      return rejected;
    }
  }

  private async enforceRiskLimits(userId: string, account: { dailyOrderLimit: number; maxOrderValue: any }, input: PlaceLiveOrderInput) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaysOrderCount = await prisma.liveOrder.count({ where: { userId, placedAt: { gte: todayStart } } });
    if (todaysOrderCount >= account.dailyOrderLimit) {
      throw new AppError(429, `Daily live order limit reached (${account.dailyOrderLimit}) - raise it from your Live Trading settings if needed`);
    }

    const estimatedValue = input.quantity * (input.price ?? 0);
    if (input.orderType !== "MARKET" && estimatedValue > Number(account.maxOrderValue)) {
      throw new AppError(400, `Order value ₹${estimatedValue.toLocaleString("en-IN")} exceeds your max order value ₹${Number(account.maxOrderValue).toLocaleString("en-IN")}`);
    }
  }

  /** SEBI Feb 2025 circular: per-order 2FA for API/algo order placement - see docs/LIVE_TRADING.md. */
  private async requireFresh2FA(userId: string, phone: string) {
    const ok = await otpService.wasRecentlyVerified(userId, "LIVE_ORDER_2FA", phone, env.LIVE_ORDER_2FA_VALIDITY_MINUTES);
    if (!ok) {
      throw new AppError(401, `Confirm this order with a fresh OTP first (valid for ${env.LIVE_ORDER_2FA_VALIDITY_MINUTES} minutes after verification)`);
    }
  }

  async sendOrderConfirmationOtp(userId: string, phone: string) {
    return otpService.send(userId, "LIVE_ORDER_2FA", phone);
  }

  async verifyOrderConfirmationOtp(userId: string, phone: string, otp: string) {
    await otpService.verify(userId, "LIVE_ORDER_2FA", phone, otp);
  }

  async cancelOrder(userId: string, liveOrderId: string) {
    const order = await prisma.liveOrder.findFirst({ where: { id: liveOrderId, userId }, include: { brokerLink: true } });
    if (!order) throw new AppError(404, "Live order not found");
    if (!order.brokerOrderId) throw new AppError(400, "This order was never accepted by the broker");
    if (order.status === "COMPLETE" || order.status === "CANCELLED" || order.status === "REJECTED") {
      throw new AppError(400, `Cannot cancel an order that is already ${order.status}`);
    }

    const adapter = getLiveTradingAdapter(order.broker);
    const result = await adapter.cancelOrder(order.brokerLink.accessToken ?? "", order.brokerOrderId);
    const updated = await prisma.liveOrder.update({
      where: { id: order.id },
      data: { status: "CANCELLED", rawResponse: result.raw as any },
    });
    await this.logEvent(order.id, "CANCELLED", { result });
    return updated;
  }

  async syncOrderStatus(userId: string, liveOrderId: string) {
    const order = await prisma.liveOrder.findFirst({ where: { id: liveOrderId, userId }, include: { brokerLink: true } });
    if (!order) throw new AppError(404, "Live order not found");
    if (!order.brokerOrderId) return order;

    const adapter = getLiveTradingAdapter(order.broker);
    const result = await adapter.getOrderStatus(order.brokerLink.accessToken ?? "", order.brokerOrderId);
    const updated = await prisma.liveOrder.update({
      where: { id: order.id },
      data: {
        status: mapStatus(result.status),
        filledQuantity: result.filledQuantity,
        averageFillPrice: result.averageFillPrice,
        rejectionReason: result.rejectionReason,
        rawResponse: result.raw as any,
      },
    });
    await this.logEvent(order.id, "STATUS_POLL", { result });
    return updated;
  }

  async listOrders(userId: string) {
    return prisma.liveOrder.findMany({ where: { userId }, orderBy: { placedAt: "desc" } });
  }

  /** Admin audit view - includes the full append-only event trail per order (see docs/LIVE_TRADING.md). */
  async listOrdersForAdmin(userId: string) {
    return prisma.liveOrder.findMany({
      where: { userId },
      include: { events: { orderBy: { occurredAt: "asc" } } },
      orderBy: { placedAt: "desc" },
    });
  }

  async getPositions(userId: string) {
    const account = await prisma.liveTradingAccount.findUnique({ where: { userId }, include: { brokerLink: true } });
    if (!account || account.status !== "ENABLED" || !account.brokerLink) throw new AppError(403, "Live trading is not enabled on your account");
    const adapter = getLiveTradingAdapter(account.brokerLink.provider);
    return adapter.getPositions(account.brokerLink.accessToken ?? "");
  }

  async getHoldings(userId: string) {
    const account = await prisma.liveTradingAccount.findUnique({ where: { userId }, include: { brokerLink: true } });
    if (!account || account.status !== "ENABLED" || !account.brokerLink) throw new AppError(403, "Live trading is not enabled on your account");
    const adapter = getLiveTradingAdapter(account.brokerLink.provider);
    return adapter.getHoldings(account.brokerLink.accessToken ?? "");
  }

  private async logEvent(liveOrderId: string, eventType: string, payload: unknown) {
    await prisma.liveOrderEvent.create({ data: { liveOrderId, eventType, payload: payload as any } });
  }
}

function mapStatus(status: string): "PENDING_SUBMISSION" | "SUBMITTED" | "OPEN" | "PARTIALLY_FILLED" | "COMPLETE" | "REJECTED" | "CANCELLED" {
  switch (status?.toUpperCase()) {
    case "COMPLETE":
      return "COMPLETE";
    case "REJECTED":
      return "REJECTED";
    case "CANCELLED":
      return "CANCELLED";
    case "OPEN":
      return "OPEN";
    case "PARTIALLY_FILLED":
      return "PARTIALLY_FILLED";
    case "SUBMITTED":
      return "SUBMITTED";
    default:
      return "OPEN";
  }
}

export const liveOrderService = new LiveOrderService();
