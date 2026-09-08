/**
 * Same adapter pattern as backend/src/brokers/IBrokerAdapter.ts and
 * backend/src/kyc/IKycProvider.ts: every bank-payout provider (Cashfree, ...)
 * implements this one interface, selected at runtime by PAYOUT_PROVIDER in
 * .env (see PayoutProviderFactory.ts). Only PrizeService ever calls through
 * this interface - nothing else in the app imports a concrete provider.
 *
 * See docs/PRIZES_AND_PAYOUTS.md for how to get real Cashfree Payouts
 * credentials, and for the MOCK provider that lets the whole release flow
 * run with no third-party account at all.
 */

export interface PayoutBeneficiary {
  beneficiaryId: string; // stable id we mint per BankAccount, e.g. `award_<awardId>` or `bank_<bankAccountId>`
  name: string;
  accountNumber: string;
  ifsc: string;
  email?: string;
  phone?: string;
}

export interface PayoutResult {
  success: boolean;
  status: string; // provider-reported status string, e.g. "SUCCESS", "PENDING", "FAILED"
  providerReferenceId?: string; // provider's transfer id, for reconciliation/support queries
  failureReason?: string;
  raw: unknown; // full provider response, stored for audit (ContestPrizeAward.payoutRaw)
}

export interface IPayoutProvider {
  readonly providerName: string;

  /**
   * Pay `amount` (INR, rupees not paise) to `beneficiary`'s bank account.
   * `transferId` must be caller-generated and idempotent (we pass the
   * ContestPrizeAward id) so retrying a timed-out call never double-pays.
   */
  initiatePayout(beneficiary: PayoutBeneficiary, amount: number, transferId: string, purpose: string): Promise<PayoutResult>;

  /** Best-effort status check, used to reconcile a PROCESSING award. */
  getPayoutStatus(transferId: string): Promise<PayoutResult>;
}
