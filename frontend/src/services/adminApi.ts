import axios from "axios";
import { getClientDeviceHints } from "../utils/device";

/**
 * Deliberately a separate axios instance from services/api.ts, with its own
 * token storage key ("adminToken", not "token") - an admin session and a
 * regular user session can be logged in side by side in the same browser
 * without clobbering each other, mirroring the fully separate backend auth
 * (ADMIN_JWT_SECRET vs JWT_SECRET, Admin table vs User table).
 */
export const adminApi = axios.create({ baseURL: "/api" });

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const hints = getClientDeviceHints();
  config.headers["x-device-id"] = hints.deviceId;
  config.headers["x-client-timezone"] = hints.clientTimezone;
  config.headers["x-client-screen"] = hints.clientScreen;

  return config;
});


export interface AdminContest {
  id: string;
  name: string;
  description?: string;
  durationType: "WEEKLY" | "MONTHLY" | "HALF_YEARLY" | "YEARLY" | "CUSTOM";
  startDate: string;
  endDate: string;
  startingVirtualCash: string;
  maxParticipants?: number;
  status: "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
  returnWeight: number;
  riskWeight: number;
  squaredOffAt?: string | null;
  createdByAdmin?: { id: string; name: string; email: string };
  _count?: { participants: number };
}

export const AdminAuthAPI = {
  login: (email: string, password: string) => adminApi.post("/admin/auth/login", { email, password }),
  me: () => adminApi.get("/admin/auth/me"),
};

export const AdminContestsAPI = {
  list: (status?: string) => adminApi.get<AdminContest[]>("/admin/contests", { params: status ? { status } : {} }),
  get: (id: string) => adminApi.get<AdminContest & { participants: any[] }>(`/admin/contests/${id}`),
  create: (payload: Record<string, unknown>) => adminApi.post<AdminContest>("/admin/contests", payload),
  update: (id: string, payload: Record<string, unknown>) => adminApi.patch<AdminContest>(`/admin/contests/${id}`, payload),
  cancel: (id: string) => adminApi.post(`/admin/contests/${id}/cancel`),
  endNow: (id: string) => adminApi.post(`/admin/contests/${id}/end-now`),
};

export interface AdminKycEntry {
  id: string;
  userId: string;
  status: "NOT_STARTED" | "DOCUMENTS_PENDING" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
  panNumber?: string | null;
  panVerified: boolean;
  submittedAt?: string | null;
  rejectionReason?: string | null;
  user: { id: string; name: string; email: string };
  documents: Array<{ id: string; type: string; originalFileName: string; status: string }>;
}

export const AdminKycAPI = {
  pending: () => adminApi.get<AdminKycEntry[]>("/admin/kyc/pending"),
  get: (userId: string) => adminApi.get<AdminKycEntry>(`/admin/kyc/${userId}`),
  documentFileUrl: (userId: string, docId: string) => `/api/admin/kyc/${userId}/documents/${docId}/file`,
  approve: (userId: string) => adminApi.post(`/admin/kyc/${userId}/approve`),
  reject: (userId: string, reason: string) => adminApi.post(`/admin/kyc/${userId}/reject`, { reason }),
};

export interface PrizeSlab {
  id?: string;
  rankFrom: number;
  rankTo: number;
  percentage: number;
}

export interface PrizeConfig {
  totalPrizePool: string;
  prizesComputedAt: string | null;
  slabs: PrizeSlab[];
}

export type PrizePayoutStatus = "PENDING_KYC" | "PENDING_BANK" | "READY" | "PROCESSING" | "PAID" | "CREDITED_TO_WALLET" | "FAILED";

export interface PrizeAward {
  id: string;
  contestId: string;
  userId: string;
  rank: number;
  grossAmount: string;
  tdsRatePct: number;
  tdsAmount: string;
  netAmount: string;
  payoutPreference: "CASH_WITHDRAWAL" | "PROP_TRADING";
  payoutStatus: PrizePayoutStatus;
  blockedReason?: string | null;
  payoutAccountLast4?: string | null;
  payoutIfsc?: string | null;
  payoutProvider?: string | null;
  paidAt?: string | null;
  unlockedLiveTradingEligibility?: boolean;
  user: { id: string; name: string; email: string; kycStatus: string; verifiedBankAccountCount: number };
}

/** Contest-scoped prize pool config + award listing - see docs/PRIZES_AND_PAYOUTS.md. */
export const AdminContestPrizesAPI = {
  getConfig: (contestId: string) => adminApi.get<PrizeConfig>(`/admin/contests/${contestId}/prizes`),
  setConfig: (contestId: string, totalPrizePool: number, slabs: Omit<PrizeSlab, "id">[]) =>
    adminApi.put<PrizeConfig>(`/admin/contests/${contestId}/prizes`, { totalPrizePool, slabs }),
  compute: (contestId: string) => adminApi.post(`/admin/contests/${contestId}/prizes/compute`),
  listAwards: (contestId: string) => adminApi.get<PrizeAward[]>(`/admin/contests/${contestId}/prizes/awards`),
};

/** Per-award actions, keyed by award id - see routes/adminPrizes.routes.ts. */
export const AdminPrizesAPI = {
  recomputeStatus: (awardId: string) => adminApi.post<PrizeAward>(`/admin/prizes/${awardId}/recompute-status`),
  release: (awardId: string) => adminApi.post<PrizeAward>(`/admin/prizes/${awardId}/release`),
};

export interface AdminLiveTradingAccount {
  id: string;
  status: "NOT_ELIGIBLE" | "ELIGIBLE" | "ENABLED" | "SUSPENDED";
  eligibleSince?: string | null;
  enabledAt?: string | null;
  dailyOrderLimit: number;
  maxOrderValue: string;
  killSwitchActive: boolean;
  suspendedReason?: string | null;
  user: { id: string; name: string; email: string };
  brokerLink?: { id: string; provider: string; nickname?: string | null } | null;
}

export interface AdminLiveOrder {
  id: string;
  broker: string;
  exchange?: string;
  tradingSymbol: string;
  transactionType: string;
  quantity: number;
  status: string;
  brokerOrderId?: string | null;
  rejectionReason?: string | null;
  placedAt: string;
  events: Array<{ id: string; eventType: string; occurredAt: string }>;
}

/** Admin oversight of live (real-money) trading accounts - see docs/LIVE_TRADING.md. */
export const AdminLiveTradingAPI = {
  listAccounts: () => adminApi.get<AdminLiveTradingAccount[]>("/admin/live-trading/accounts"),
  suspend: (userId: string, reason: string) => adminApi.post(`/admin/live-trading/accounts/${userId}/suspend`, { reason }),
  reinstate: (userId: string) => adminApi.post(`/admin/live-trading/accounts/${userId}/reinstate`),
  grantEligibility: (userId: string) => adminApi.post(`/admin/live-trading/accounts/${userId}/grant-eligibility`),
  orderAudit: (userId: string) => adminApi.get<AdminLiveOrder[]>(`/admin/live-trading/accounts/${userId}/orders`),
};

export interface AdminLoginAuditItem {
  id: string;
  userId?: string | null;
  email: string;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  failureReason?: string | null;
  authMethod: string;
  ipAddress: string;
  deviceId: string;
  userAgent: string;
  browser: string;
  browserVersion?: string | null;
  os: string;
  osVersion?: string | null;
  deviceType: string;
  deviceModel?: string | null;
  timezone?: string | null;
  screenResolution?: string | null;
  country?: string | null;
  city?: string | null;
  isSuspicious: boolean;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    kyc?: { status: string } | null;
    liveTradingAccount?: { status: string } | null;
  } | null;
}

export interface AdminSecurityStats {
  total24h: number;
  success24h: number;
  failed24h: number;
  failureRate24h: string;
  total7d: number;
  suspiciousCount: number;
  uniqueDevicesCount: number;
  uniqueIpsCount: number;
}

export interface UserSecurityOverview {
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    wallet?: { cashBalance: string } | null;
    kyc?: { status: string; panVerified: boolean } | null;
    liveTradingAccount?: { status: string } | null;
  };
  totalLogins: number;
  failedAttempts: number;
  devices: Array<{
    deviceId: string;
    deviceType: string;
    browser: string;
    os: string;
    loginCount: number;
    firstSeen: string;
    lastSeen: string;
  }>;
  ips: Array<{
    ipAddress: string;
    country?: string | null;
    city?: string | null;
    count: number;
    lastSeen: string;
  }>;
  recentLogins: AdminLoginAuditItem[];
}

export const AdminLoginHistoryAPI = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    userId?: string;
    isSuspicious?: boolean;
    startDate?: string;
    endDate?: string;
  }) =>
    adminApi.get<{ items: AdminLoginAuditItem[]; total: number; page: number; totalPages: number }>("/admin/login-history", {
      params,
    }),
  getStats: () => adminApi.get<AdminSecurityStats>("/admin/login-history/stats"),
  getUserDetail: (userId: string) => adminApi.get<UserSecurityOverview>(`/admin/login-history/users/${userId}`),
};

