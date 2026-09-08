/**
 * Same adapter pattern as backend/src/brokers/IBrokerAdapter.ts: every KYC /
 * bank-verification provider (Setu, Cashfree, ...) implements this one
 * interface, selected at runtime by KYC_PROVIDER in .env (see
 * KycProviderFactory.ts). The rest of the app - KycService,
 * BankAccountService, routes - never imports a concrete provider directly.
 *
 * See docs/KYC_AND_BANKING.md for how to get real Setu/Cashfree credentials,
 * and for the MOCK provider that lets the whole flow run with no
 * third-party account at all.
 */

export interface PanVerificationResult {
  valid: boolean;
  panStatus?: string; // e.g. "VALID", "INVALID" - provider-reported PAN status with NSDL
  registeredName?: string; // name on record with the PAN issuer
  nameMatch?: boolean; // whether registeredName matches the name the user submitted
  aadhaarSeedingStatus?: string; // PAN-Aadhaar linking status, when the provider returns it
  raw: unknown; // full provider response, stored for audit (Kyc.panVerificationRaw)
}

export interface BankAccountVerificationResult {
  valid: boolean;
  nameAtBank?: string; // account holder name as per bank records
  nameMatchResult?: "MATCH" | "PARTIAL_MATCH" | "NO_MATCH";
  nameMatchScore?: number; // 0-100, when the provider returns a fuzzy score instead of a bucket
  bankName?: string;
  branch?: string;
  raw: unknown; // full provider response, stored for audit (BankAccount.verificationRaw)
}

export interface IKycProvider {
  readonly providerName: string;

  verifyPan(panNumber: string, fullName: string, dateOfBirth?: string): Promise<PanVerificationResult>;

  verifyBankAccount(accountNumber: string, ifsc: string, accountHolderName: string): Promise<BankAccountVerificationResult>;
}
