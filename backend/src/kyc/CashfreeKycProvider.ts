import axios, { AxiosInstance } from "axios";
import { IKycProvider, PanVerificationResult, BankAccountVerificationResult } from "./IKycProvider";

/**
 * Cashfree Verification Suite (PAN Verification + Bank Account Verification
 * - Penny Drop). Confirmed against Cashfree's published OpenAPI spec
 * (cashfree.com/docs/api-reference/vrs): base URLs are
 * sandbox.cashfree.com/verification and api.cashfree.com/verification, auth
 * is x-client-id / x-client-secret headers plus a required x-api-version
 * date header, and every verification call takes an explicit consent object
 * (Cashfree requires proof of user consent, timestamped within 5 minutes,
 * on every identity/bank check).
 *
 * Setup manual: see docs/KYC_AND_BANKING.md#cashfree
 * Docs: https://www.cashfree.com/docs/api-reference/vrs
 */
export class CashfreeKycProvider implements IKycProvider {
  readonly providerName = "CASHFREE";
  private http: AxiosInstance;

  constructor(clientId: string, clientSecret: string, sandbox: boolean) {
    this.http = axios.create({
      baseURL: sandbox ? "https://sandbox.cashfree.com/verification" : "https://api.cashfree.com/verification",
      headers: {
        "x-client-id": clientId,
        "x-client-secret": clientSecret,
        "x-api-version": "2024-12-01",
        "Content-Type": "application/json",
      },
    });
  }

  private consent(purpose: string) {
    return {
      obtained: true,
      type: "EXPLICIT",
      timestamp: new Date().toISOString(),
      purpose,
    };
  }

  async verifyPan(panNumber: string, fullName: string, dateOfBirth?: string): Promise<PanVerificationResult> {
    const res = await this.http.post("/pan", {
      pan: panNumber.toUpperCase(),
      name: fullName,
      dob: dateOfBirth,
      user_consent: this.consent("Verifying PAN card during platform profile KYC onboarding"),
    });
    const data = res.data;
    const valid = data.status === "VALID";
    return {
      valid,
      panStatus: data.status,
      registeredName: data.registered_name,
      nameMatch: data.name_match_result ? data.name_match_result === "MATCH" : undefined,
      aadhaarSeedingStatus: data.aadhaar_seeding_status,
      raw: data,
    };
  }

  /** Classic bank-account-number + IFSC penny drop (not the UPI-VPA variant). */
  async verifyBankAccount(accountNumber: string, ifsc: string, accountHolderName: string): Promise<BankAccountVerificationResult> {
    const verificationId = `bav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const res = await this.http.post("/bank-account/sync", {
      verification_id: verificationId,
      bank_account: accountNumber,
      ifsc: ifsc.toUpperCase(),
      name: accountHolderName,
      user_consent: this.consent("Verifying bank account for platform bank details section"),
    });
    const data = res.data;
    const valid = data.account_status === "VALID" || data.status === "VALID";
    return {
      valid,
      nameAtBank: data.name_at_bank,
      nameMatchResult: normalizeMatchResult(data.name_match_result),
      nameMatchScore: data.name_match_score ? Number(data.name_match_score) : undefined,
      bankName: data.ifsc_details?.bank,
      branch: data.ifsc_details?.branch,
      raw: data,
    };
  }
}

function normalizeMatchResult(value: unknown): "MATCH" | "PARTIAL_MATCH" | "NO_MATCH" | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.toUpperCase();
  if (v.includes("PARTIAL") || v.includes("GOOD")) return "PARTIAL_MATCH";
  if (v === "MATCH") return "MATCH";
  return "NO_MATCH";
}
