import { api } from "./api";

export interface BrokerLink {
  id: string;
  provider: "ZERODHA" | "UPSTOX" | "ANGELONE" | "ICICIDIRECT" | "MOCK";
  nickname?: string | null;
  createdAt: string;
}

export type LiveTradingStatus = "NOT_ELIGIBLE" | "ELIGIBLE" | "ENABLED" | "SUSPENDED";

export interface LiveTradingAccount {
  id: string;
  status: LiveTradingStatus;
  eligibleSince?: string | null;
  enabledAt?: string | null;
  brokerLinkId?: string | null;
  dailyOrderLimit: number;
  maxOrderValue: string;
  killSwitchActive: boolean;
  suspendedReason?: string | null;
  liveTradingEnabledOnDeployment: boolean;
}

export type LiveOrderStatus = "PENDING_SUBMISSION" | "SUBMITTED" | "OPEN" | "PARTIALLY_FILLED" | "COMPLETE" | "REJECTED" | "CANCELLED";

export interface LiveOrder {
  id: string;
  broker: string;
  exchange: string;
  tradingSymbol: string;
  transactionType: "BUY" | "SELL";
  orderType: string;
  productType: string;
  quantity: number;
  price?: string | null;
  brokerOrderId?: string | null;
  status: LiveOrderStatus;
  filledQuantity: number;
  averageFillPrice?: string | null;
  rejectionReason?: string | null;
  placedAt: string;
}

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
  twoFactorPhone: string;
}

export const LiveTradingAPI = {
  getAccount: () => api.get<LiveTradingAccount>("/live-trading/account"),
  listBrokers: () => api.get<BrokerLink[]>("/live-trading/brokers"),
  linkBroker: (payload: { provider: BrokerLink["provider"]; accessToken: string; nickname?: string }) =>
    api.post<BrokerLink>("/live-trading/brokers", payload),
  unlinkBroker: (id: string) => api.delete(`/live-trading/brokers/${id}`),
  enable: (brokerLinkId: string) => api.post<LiveTradingAccount>("/live-trading/enable", { brokerLinkId }),
  disable: () => api.post<LiveTradingAccount>("/live-trading/disable"),
  setKillSwitch: (active: boolean) => api.post<LiveTradingAccount>("/live-trading/kill-switch", { active }),
  updateRiskLimits: (dailyOrderLimit: number, maxOrderValue: number) =>
    api.patch<LiveTradingAccount>("/live-trading/risk-limits", { dailyOrderLimit, maxOrderValue }),
  sendOrderOtp: (phone: string) => api.post("/live-trading/orders/confirm-otp/send", { phone }),
  verifyOrderOtp: (phone: string, otp: string) => api.post("/live-trading/orders/confirm-otp/verify", { phone, otp }),
  placeOrder: (payload: PlaceLiveOrderInput) => api.post<LiveOrder>("/live-trading/orders", payload),
  listOrders: () => api.get<LiveOrder[]>("/live-trading/orders"),
  cancelOrder: (id: string) => api.post<LiveOrder>(`/live-trading/orders/${id}/cancel`),
  syncOrder: (id: string) => api.post<LiveOrder>(`/live-trading/orders/${id}/sync`),
  positions: () => api.get<any[]>("/live-trading/positions"),
  holdings: () => api.get<any[]>("/live-trading/holdings"),
};
