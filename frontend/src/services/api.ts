import axios from "axios";
import { getClientDeviceHints } from "../utils/device";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token") || localStorage.getItem("adminToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const hints = getClientDeviceHints();
  config.headers["x-device-id"] = hints.deviceId;
  config.headers["x-client-timezone"] = hints.clientTimezone;
  config.headers["x-client-screen"] = hints.clientScreen;

  return config;
});

export interface Instrument {
  id: string;
  tradingSymbol: string;
  exchange: string;
  segment: "EQUITY" | "FUTURES" | "OPTIONS";
  instrumentToken: string;
  lotSize: number;
  lastPrice?: string;
}

export const AuthAPI = {
  signup: (name: string, email: string, password: string, phone: string) => {
    const hints = getClientDeviceHints();
    return api.post<{
      requiresVerification?: boolean;
      userId: string;
      name: string;
      email: string;
      phone: string;
      demoOtp?: { emailOtp?: string; phoneOtp?: string };
      message?: string;
      token?: string;
      user?: any;
    }>("/auth/signup", { name, email, password, phone, ...hints });
  },

  verifyRegistrationOtp: (payload: { userId: string; emailOtp: string; phoneOtp: string }) => {
    const hints = getClientDeviceHints();
    return api.post<{
      success: boolean;
      verified: boolean;
      token: string;
      user: any;
      message?: string;
    }>("/auth/verify-registration-otp", { ...payload, deviceId: hints.deviceId });
  },

  resendVerificationOtp: (payload: { userId: string; channel?: "email" | "phone" | "both" }) =>
    api.post<{
      sent: boolean;
      message: string;
      demoOtp?: { emailOtp?: string; phoneOtp?: string };
    }>("/auth/resend-verification-otp", payload),

  login: (email: string, password: string) => {
    const hints = getClientDeviceHints();
    return api.post<{
      token?: string;
      user?: any;
      requiresVerification?: boolean;
      requiresLoginOtp?: boolean;
      userId?: string;
      email?: string;
      phone?: string;
      demoOtp?: { emailOtp?: string; phoneOtp?: string; otp?: string };
      message?: string;
    }>("/auth/login", { email, password, ...hints });
  },

  verifyLoginOtp: (payload: { userId: string; otp: string }) => {
    const hints = getClientDeviceHints();
    return api.post<{
      token: string;
      user: any;
    }>("/auth/verify-login-otp", { ...payload, deviceId: hints.deviceId });
  },

  sendPasswordResetOtp: (target: string | { email?: string; phone?: string; identifier?: string }) => {
    const payload = typeof target === "string" ? { identifier: target } : target;
    return api.post<{ sent: boolean; message: string; expiresAt: string; otp?: string; destination?: string }>(
      "/auth/forgot-password/send-otp",
      payload
    );
  },
  resetPassword: (payload: { email?: string; phone?: string; identifier?: string; otp: string; newPassword: string }) => {
    const hints = getClientDeviceHints();
    return api.post<{ success: boolean; message: string }>("/auth/forgot-password/reset", {
      ...payload,
      deviceId: hints.deviceId,
    });
  },
};




export interface MarketDepthLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface MarketDepth {
  buy: MarketDepthLevel[];
  sell: MarketDepthLevel[];
}

export interface FullMarketQuote {
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
  depth?: MarketDepth;
  timestamp: string;
}

export const MarketAPI = {
  search: (q?: string, exchange?: string, segment?: string, limit?: number, page?: number) =>
    api.get<Instrument[]>("/market/instruments", {
      params: {
        q: q ? q.trim() : undefined,
        exchange: exchange && exchange !== "ALL" ? exchange : undefined,
        segment: segment && segment !== "ALL" ? segment : undefined,
        limit,
        page,
      },
    }),
  quote: (tokens: string[]) => api.get<FullMarketQuote[]>("/market/quote", { params: { tokens: tokens.join(",") } }),
  kiteQuote: (instruments: string[]) => api.get<{ status: string; data: Record<string, any> }>("/market/quote", { params: { i: instruments.join(","), mode: "kite" } }),
  ohlc: (instruments: string[]) => api.get<{ status: string; data: Record<string, any> }>("/market/quote/ohlc", { params: { i: instruments.join(",") } }),
  ltp: (instruments: string[]) => api.get<{ status: string; data: Record<string, any> }>("/market/quote/ltp", { params: { i: instruments.join(",") } }),
  history: (token: string, interval: string, from: string, to: string) =>
    api.get("/market/history", { params: { token, interval, from, to } }),
  syncInstruments: (exchange?: string) =>
    api.post<{ synced: number; totalInDb: number }>("/market/sync-instruments", {}, { params: { exchange } }),
};

export const OrdersAPI = {
  place: (payload: Record<string, unknown>) => api.post("/orders", payload),
  list: () => api.get("/orders"),
  cancel: (id: string) => api.delete(`/orders/${id}`),
};

export const PortfolioAPI = {
  get: () => api.get("/portfolio"),
};

export const OptionsAPI = {
  chain: (underlying: string, expiry: string) =>
    api.get("/options/chain", { params: { underlying, expiry } }),
};

export interface Contest {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  startingVirtualCash: string;
  maxParticipants?: number;
  status: "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
  durationType?: "WEEKLY" | "MONTHLY" | "HALF_YEARLY" | "YEARLY" | "CUSTOM";
  returnWeight: number;
  riskWeight: number;
  _count?: { participants: number };
}

export interface LeaderboardRow {
  contestParticipantId: string;
  userId: string;
  name: string;
  nav?: number;
  returnPct: number;
  riskScore: number;
  maxDrawdownPct: number;
  compositeScore: number;
  rank: number | null;
}

export interface PrizePoolInfo {
  totalPrizePool: string;
  prizesComputedAt: string | null;
  slabs: Array<{ rankFrom: number; rankTo: number; percentage: number }>;
}

export interface MyPrizeAward {
  id: string;
  rank: number;
  grossAmount: string;
  tdsRatePct: number;
  tdsAmount: string;
  netAmount: string;
  payoutPreference: "CASH_WITHDRAWAL" | "PROP_TRADING";
  payoutStatus: "PENDING_KYC" | "PENDING_BANK" | "READY" | "PROCESSING" | "PAID" | "CREDITED_TO_WALLET" | "FAILED";
  blockedReason?: string | null;
  paidAt?: string | null;
}

// NOTE: contest creation is admin-only now - see services/adminApi.ts (AdminContestsAPI.create).
export const ContestsAPI = {
  list: (status?: string) => api.get<Contest[]>("/contests", { params: status ? { status } : {} }),
  get: (id: string) => api.get<Contest>(`/contests/${id}`),
  join: (id: string) => api.post(`/contests/${id}/join`),
  me: (id: string) => api.get(`/contests/${id}/me`),
  leaderboard: (id: string, recompute = false) =>
    api.get<LeaderboardRow[]>(`/contests/${id}/leaderboard`, { params: recompute ? { recompute: "true" } : {} }),
  prizePool: (id: string) => api.get<PrizePoolInfo>(`/contests/${id}/prizes`),
  myPrize: (id: string) => api.get<MyPrizeAward>(`/contests/${id}/my-prize`),
};
