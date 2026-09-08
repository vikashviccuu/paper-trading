import axios, { AxiosInstance } from "axios";
import { IKycProvider, PanVerificationResult, BankAccountVerificationResult } from "./IKycProvider";

/**
 * Setu Data & Identity APIs (PAN Verification + Bank Account Verification -
 * Penny Drop). Setu connects directly to NSDL for PAN and to the banking
 * network for penny drop, and returns JSON.
 *
 * Setup manual: see docs/KYC_AND_BANKING.md#setu
 * Docs: https://docs.setu.co/data/pan/ and https://docs.setu.co/data/bav/
 *
 * IMPORTANT: Setu's exact request/response field names are versioned and
 * documented interactively at the links above (their docs are a JS app, not
 * static HTML, so double-check field names there before going to
 * production) - this adapter follows Setu's well-established auth
 * convention (x-client-id / x-client-secret / x-product-instance-id
 * headers, api.setu.co / sandbox host split) and general response shape.
 */
export class SetuKycProvider implements IKycProvider {
  readonly providerName = "SETU";
  private http: AxiosInstance;

  constructor(clientId: string, clientSecret: string, productInstanceId: string, sandbox: boolean) {
    this.http = axios.create({
      baseURL: sandbox ? "https://dg-sandbox.setu.co" : "https://dg.setu.co",
      headers: {
        "x-client-id": clientId,
        "x-client-secret": clientSecret,
        "x-product-instance-id": productInstanceId,
        "Content-Type": "application/json",
      },
    });
  }

  async verifyPan(panNumber: string, fullName: string): Promise<PanVerificationResult> {
    const res = await this.http.post("/api/verify/pan", { pan: panNumber.toUpperCase() });
    const data = res.data;
    const valid = data.status === "VALID" || data.pan_status === "VALID";
    return {
      valid,
      panStatus: data.status ?? data.pan_status,
      registeredName: data.full_name ?? data.registered_name,
      nameMatch: valid ? namesRoughlyMatch(fullName, data.full_name ?? data.registered_name ?? "") : false,
      aadhaarSeedingStatus: data.aadhaar_seeding_status,
      raw: data,
    };
  }

  async verifyBankAccount(accountNumber: string, ifsc: string, accountHolderName: string): Promise<BankAccountVerificationResult> {
    const res = await this.http.post("/api/verify/bav", {
      bankAccount: accountNumber,
      ifsc: ifsc.toUpperCase(),
      name: accountHolderName,
    });
    const data = res.data;
    const valid = data.accountExists === true || data.status === "VALID";
    return {
      valid,
      nameAtBank: data.nameAtBank ?? data.name_at_bank,
      nameMatchResult: normalizeMatchResult(data.nameMatchResult ?? data.name_match_result),
      nameMatchScore: data.nameMatchScore ?? data.name_match_score,
      bankName: data.ifscDetails?.bank ?? data.bank,
      branch: data.ifscDetails?.branch ?? data.branch,
      raw: data,
    };
  }
}

function namesRoughlyMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  return norm(a) === norm(b);
}

function normalizeMatchResult(value: unknown): "MATCH" | "PARTIAL_MATCH" | "NO_MATCH" | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.toUpperCase();
  if (v.includes("PARTIAL")) return "PARTIAL_MATCH";
  if (v === "MATCH" || v === "SUCCESS" || v === "VALID") return "MATCH";
  return "NO_MATCH";
}
