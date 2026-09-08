import { ILiveTradingAdapter, LiveOrderRequest, LiveOrderResult, LiveOrderStatusResult, LivePositionDTO, LiveHoldingDTO } from "./ILiveTradingAdapter";

/**
 * Simulates a broker's live order API with no real account, no real money,
 * and no network call - lets the entire eligibility -> link -> enable ->
 * place -> 2FA -> audit-trail flow be exercised end to end safely. This is
 * the only adapter that should ever run against a BrokerLink that doesn't
 * hold real credentials. Never wire this up in a deployment that has
 * LIVE_TRADING_ENABLED=true pointed at real user money.
 */
export class MockLiveTradingAdapter implements ILiveTradingAdapter {
  readonly providerName = "MOCK";

  async placeOrder(_accessToken: string, order: LiveOrderRequest): Promise<LiveOrderResult> {
    const brokerOrderId = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      brokerOrderId,
      status: order.orderType === "MARKET" ? "COMPLETE" : "OPEN",
      raw: { mock: true, order, acceptedAt: new Date().toISOString() },
    };
  }

  async modifyOrder(_accessToken: string, brokerOrderId: string): Promise<LiveOrderResult> {
    return { brokerOrderId, status: "OPEN", raw: { mock: true, modifiedAt: new Date().toISOString() } };
  }

  async cancelOrder(_accessToken: string, brokerOrderId: string): Promise<LiveOrderResult> {
    return { brokerOrderId, status: "CANCELLED", raw: { mock: true, cancelledAt: new Date().toISOString() } };
  }

  async getOrderStatus(_accessToken: string, brokerOrderId: string): Promise<LiveOrderStatusResult> {
    return { brokerOrderId, status: "COMPLETE", filledQuantity: 0, raw: { mock: true } };
  }

  async getPositions(_accessToken: string): Promise<LivePositionDTO[]> {
    return [];
  }

  async getHoldings(_accessToken: string): Promise<LiveHoldingDTO[]> {
    return [];
  }
}
