import axios, { AxiosInstance } from "axios";
import { IPayoutProvider, PayoutBeneficiary, PayoutResult } from "./IPayoutProvider";

/**
 * Cashfree Payouts V2 (confirmed structure against
 * cashfree.com/docs/api-reference/payouts/overview): Beneficiary management
 * (Create/Get/Remove Beneficiary V2) plus Standard Transfer V2 and Get
 * Transfer Status V2 for a single bank-account disbursement. Same
 * x-client-id / x-client-secret + x-api-version header convention as
 * CashfreeKycProvider.ts (Cashfree's Verification Suite), but Payouts is a
 * *separate* Cashfree product with its own API credentials
 * (CASHFREE_PAYOUT_CLIENT_ID/SECRET, not CASHFREE_CLIENT_ID/SECRET).
 *
 * IMPORTANT: the exact request/response field names below follow Cashfree's
 * documented V2 conventions but were not verified against a live sandbox
 * call in this environment - re-check them against
 * https://www.cashfree.com/docs/api-reference/payouts/overview before
 * processing a real payout. See docs/PRIZES_AND_PAYOUTS.md.
 *
 * Setup manual: see docs/PRIZES_AND_PAYOUTS.md#cashfree-payouts
 */
export class CashfreePayoutProvider implements IPayoutProvider {
  readonly providerName = "CASHFREE";
  private http: AxiosInstance;

  constructor(clientId: string, clientSecret: string, sandbox: boolean) {
    this.http = axios.create({
      baseURL: sandbox ? "https://payout-gamma.cashfree.com/payout/v2" : "https://payout-api.cashfree.com/payout/v2",
      headers: {
        "x-client-id": clientId,
        "x-client-secret": clientSecret,
        "x-api-version": "2024-01-01",
        "Content-Type": "application/json",
      },
    });
  }

  /** Idempotent: creates the beneficiary if missing, silently proceeds if it already exists. */
  private async ensureBeneficiary(beneficiary: PayoutBeneficiary): Promise<void> {
    try {
      await this.http.post("/beneficiary", {
        beneficiary_id: beneficiary.beneficiaryId,
        beneficiary_name: beneficiary.name,
        beneficiary_instrument_details: {
          bank_account_number: beneficiary.accountNumber,
          bank_ifsc: beneficiary.ifsc,
        },
        beneficiary_contact_details: {
          beneficiary_email: beneficiary.email,
          beneficiary_phone: beneficiary.phone,
        },
      });
    } catch (err: any) {
      const code = err?.response?.data?.code;
      // Cashfree returns a specific "already exists" error code when the
      // beneficiary_id was already created (e.g. on a retried release) -
      // that's fine, fall through and transfer to it.
      if (code === "beneficiary_already_exists" || err?.response?.status === 409) {
        return;
      }
      throw err;
    }
  }

  async initiatePayout(beneficiary: PayoutBeneficiary, amount: number, transferId: string, purpose: string): Promise<PayoutResult> {
    await this.ensureBeneficiary(beneficiary);

    const res = await this.http.post("/transfers", {
      transfer_id: transferId, // caller-generated (ContestPrizeAward.id) - idempotency key on Cashfree's side too
      transfer_amount: amount,
      beneficiary_details: { beneficiary_id: beneficiary.beneficiaryId },
      transfer_mode: "banktransfer",
      remarks: purpose.slice(0, 60), // Cashfree caps remarks length
    });
    const data = res.data;
    const status = String(data.status ?? data.transfer_status ?? "UNKNOWN").toUpperCase();
    return {
      success: status === "SUCCESS" || status === "RECEIVED" || status === "PENDING",
      status,
      providerReferenceId: data.transfer_utr ?? data.cf_transfer_id ?? data.transfer_id,
      failureReason: status === "FAILED" || status === "REJECTED" ? data.status_description ?? data.reason : undefined,
      raw: data,
    };
  }

  async getPayoutStatus(transferId: string): Promise<PayoutResult> {
    const res = await this.http.get("/transfers", { params: { transfer_id: transferId } });
    const data = res.data;
    const status = String(data.status ?? data.transfer_status ?? "UNKNOWN").toUpperCase();
    return {
      success: status === "SUCCESS",
      status,
      providerReferenceId: data.transfer_utr ?? data.cf_transfer_id ?? data.transfer_id,
      failureReason: status === "FAILED" || status === "REJECTED" ? data.status_description ?? data.reason : undefined,
      raw: data,
    };
  }
}
