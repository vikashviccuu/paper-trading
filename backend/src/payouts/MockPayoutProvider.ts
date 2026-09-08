import { IPayoutProvider, PayoutBeneficiary, PayoutResult } from "./IPayoutProvider";

/**
 * Always "succeeds" instantly with no third-party account - lets the whole
 * KYC-gated release flow (Ready -> Release -> Paid) be exercised end to end
 * in MOCK mode, the same role MockKycProvider/MockAdapter play elsewhere.
 */
export class MockPayoutProvider implements IPayoutProvider {
  readonly providerName = "MOCK";

  async initiatePayout(beneficiary: PayoutBeneficiary, amount: number, transferId: string, purpose: string): Promise<PayoutResult> {
    return {
      success: true,
      status: "SUCCESS",
      providerReferenceId: `mock_txn_${transferId}`,
      raw: {
        mock: true,
        beneficiaryId: beneficiary.beneficiaryId,
        amount,
        transferId,
        purpose,
        settledAt: new Date().toISOString(),
      },
    };
  }

  async getPayoutStatus(transferId: string): Promise<PayoutResult> {
    return {
      success: true,
      status: "SUCCESS",
      providerReferenceId: `mock_txn_${transferId}`,
      raw: { mock: true, transferId },
    };
  }
}
