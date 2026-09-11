import { api } from "./api";

export interface UserProfile {
  id: string;
  userId: string;
  dateOfBirth?: string | null;
  gender?: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY" | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  phone?: string | null;
  phoneVerified: boolean;
  alternateEmail?: string | null;
  payoutPreference: "CASH_WITHDRAWAL" | "PROP_TRADING";
}

export interface KycDocument {
  id: string;
  type: "PAN_CARD" | "AADHAAR_FRONT" | "AADHAAR_BACK" | "ADDRESS_PROOF" | "BANK_PROOF" | "PHOTO";
  originalFileName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote?: string | null;
  uploadedAt: string;
}

export interface Kyc {
  id: string;
  status: "NOT_STARTED" | "DOCUMENTS_PENDING" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
  panNumber?: string | null;
  panVerified: boolean;
  panVerificationProvider?: string | null;
  rejectionReason?: string | null;
  documents: KycDocument[];
}

export interface BankAccount {
  id: string;
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  bankName?: string | null;
  branch?: string | null;
  isPrimary: boolean;
  verificationStatus: "NOT_VERIFIED" | "PENDING" | "VERIFIED" | "FAILED";
  nameAtBank?: string | null;
  nameMatchResult?: string | null;
  verifiedAt?: string | null;
}

export const ProfileAPI = {
  get: () => api.get("/profile"),
  updatePersonal: (payload: Record<string, unknown>) => api.patch<UserProfile>("/profile/personal", payload),
  updateAddress: (payload: Record<string, unknown>) => api.patch<UserProfile>("/profile/address", payload),
  updateCommunication: (payload: Record<string, unknown>) => api.patch<UserProfile>("/profile/communication", payload),
  sendPhoneOtp: (phone: string) => api.post("/profile/communication/phone/send-otp", { phone }),
  verifyPhoneOtp: (phone: string, otp: string) => api.post<UserProfile>("/profile/communication/phone/verify-otp", { phone, otp }),
  updatePayoutPreference: (preference: "CASH_WITHDRAWAL" | "PROP_TRADING") =>
    api.patch<UserProfile>("/profile/payout-preference", { preference }),
  getLoginHistory: (page = 1, limit = 20) =>
    api.get<{ items: UserLoginHistoryItem[]; total: number; page: number; totalPages: number }>("/profile/login-history", {
      params: { page, limit },
    }),
};

export interface UserLoginHistoryItem {
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
  isCurrentDevice?: boolean;
}


export const KycAPI = {
  get: () => api.get<Kyc>("/kyc"),
  verifyPan: (panNumber: string, fullName: string, dateOfBirth?: string) =>
    api.post("/kyc/pan/verify", { panNumber, fullName, dateOfBirth }),
  uploadDocument: (type: KycDocument["type"], file: File) => {
    const form = new FormData();
    form.append("type", type);
    form.append("document", file);
    return api.post<KycDocument>("/kyc/documents", form, { headers: { "Content-Type": "multipart/form-data" } });
  },
  documentFileUrl: (id: string) => `/api/kyc/documents/${id}/file`,
  submit: () => api.post<Kyc>("/kyc/submit"),
};

export const BankAccountsAPI = {
  list: () => api.get<BankAccount[]>("/bank-accounts"),
  add: (payload: { accountHolderName: string; accountNumber: string; ifsc: string }) =>
    api.post<BankAccount>("/bank-accounts", payload),
  reverify: (id: string) => api.post<BankAccount>(`/bank-accounts/${id}/verify`),
  setPrimary: (id: string) => api.patch<BankAccount>(`/bank-accounts/${id}/primary`),
  remove: (id: string) => api.delete(`/bank-accounts/${id}`),
};
