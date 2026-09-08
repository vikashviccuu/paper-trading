import { IKycProvider, PanVerificationResult, BankAccountVerificationResult } from "./IKycProvider";

/**
 * Deterministic fake verification - no third-party account needed. Default
 * (KYC_PROVIDER=MOCK) so the whole profile/KYC/bank flow is fully testable
 * out of the box. Mirrors real providers' validation rules loosely (PAN
 * format, IFSC format) so the UI's error states are exercised too, but
 * always "succeeds" for well-formed input - swap to SETU or CASHFREE for
 * real verification (see docs/KYC_AND_BANKING.md).
 */
export class MockKycProvider implements IKycProvider {
  readonly providerName = "MOCK";

  private static PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  private static IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

  async verifyPan(panNumber: string, fullName: string): Promise<PanVerificationResult> {
    const valid = MockKycProvider.PAN_REGEX.test(panNumber.toUpperCase());
    return {
      valid,
      panStatus: valid ? "VALID" : "INVALID",
      registeredName: valid ? fullName : undefined,
      nameMatch: valid,
      aadhaarSeedingStatus: valid ? "LINKED" : undefined,
      raw: { mock: true, panNumber, valid },
    };
  }

  async verifyBankAccount(accountNumber: string, ifsc: string, accountHolderName: string): Promise<BankAccountVerificationResult> {
    const validAccount = /^[0-9]{9,18}$/.test(accountNumber);
    const validIfsc = MockKycProvider.IFSC_REGEX.test(ifsc.toUpperCase());
    const valid = validAccount && validIfsc;

    return {
      valid,
      nameAtBank: valid ? accountHolderName : undefined,
      nameMatchResult: valid ? "MATCH" : "NO_MATCH",
      nameMatchScore: valid ? 96 : 0,
      bankName: valid ? "Demo Bank (mock)" : undefined,
      branch: valid ? "Mock Branch" : undefined,
      raw: { mock: true, accountNumber, ifsc, valid },
    };
  }
}
