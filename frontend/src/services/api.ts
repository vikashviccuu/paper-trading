import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
  signup: (name: string, email: string, password: string) =>
    api.post("/auth/signup", { name, email, password }),
  login: (email: string, password: string) => api.post("/auth/login", { email, password }),
};

export const MarketAPI = {
  search: (q: string) => api.get<Instrument[]>("/market/instruments", { params: { q } }),
  quote: (tokens: string[]) => api.get("/market/quote", { params: { tokens: tokens.join(",") } }),
  history: (token: string, interval: string, from: string, to: string) =>
    api.get("/market/history", { params: { token, interval, from, to } }),
  syncInstruments: () => api.post("/market/sync-instruments"),
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
