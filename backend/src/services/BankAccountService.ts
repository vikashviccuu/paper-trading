import { prisma } from "../utils/prisma";
import { getKycProvider } from "../kyc/KycProviderFactory";
import { AppError } from "../engine/OrderEngine";

export interface AddBankAccountInput {
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
}

/**
 * Adding a bank account immediately triggers online penny-drop verification
 * against whichever KYC_PROVIDER is configured (Setu / Cashfree / Mock) -
 * this is the "online verification of bank details" the profile page asks
 * for. The provider sends a nominal transfer to the account and reports
 * back the registered account holder name, which we compare against what
 * the user typed (see BankAccount.nameMatchResult).
 */
export class BankAccountService {
  async list(userId: string) {
    return prisma.bankAccount.findMany({ where: { userId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
  }

  async add(userId: string, input: AddBankAccountInput) {
    const existing = await prisma.bankAccount.findUnique({
      where: { userId_accountNumber_ifsc: { userId, accountNumber: input.accountNumber, ifsc: input.ifsc.toUpperCase() } },
    });
    if (existing) throw new AppError(409, "This bank account is already on your profile");

    const isFirst = (await prisma.bankAccount.count({ where: { userId } })) === 0;

    const account = await prisma.bankAccount.create({
      data: {
        userId,
        accountHolderName: input.accountHolderName,
        accountNumber: input.accountNumber,
        ifsc: input.ifsc.toUpperCase(),
        isPrimary: isFirst,
        verificationStatus: "PENDING",
      },
    });

    return this.verify(userId, account.id);
  }

  async verify(userId: string, accountId: string) {
    const account = await prisma.bankAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new AppError(404, "Bank account not found");

    const provider = getKycProvider();
    try {
      const result = await provider.verifyBankAccount(account.accountNumber, account.ifsc, account.accountHolderName);
      return prisma.bankAccount.update({
        where: { id: account.id },
        data: {
          verificationStatus: result.valid ? "VERIFIED" : "FAILED",
          verificationProvider: provider.providerName,
          verificationRaw: result.raw as any,
          nameAtBank: result.nameAtBank,
          nameMatchResult: result.nameMatchResult,
          bankName: result.bankName,
          branch: result.branch,
          verifiedAt: result.valid ? new Date() : null,
        },
      });
    } catch (err) {
      return prisma.bankAccount.update({
        where: { id: account.id },
        data: { verificationStatus: "FAILED", verificationProvider: provider.providerName },
      });
    }
  }

  async setPrimary(userId: string, accountId: string) {
    const account = await prisma.bankAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new AppError(404, "Bank account not found");
    if (account.verificationStatus !== "VERIFIED") {
      throw new AppError(400, "Only a verified bank account can be set as primary");
    }

    await prisma.$transaction([
      prisma.bankAccount.updateMany({ where: { userId }, data: { isPrimary: false } }),
      prisma.bankAccount.update({ where: { id: accountId }, data: { isPrimary: true } }),
    ]);
    return prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
  }

  async remove(userId: string, accountId: string) {
    const account = await prisma.bankAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new AppError(404, "Bank account not found");
    await prisma.bankAccount.delete({ where: { id: accountId } });
  }
}

export const bankAccountService = new BankAccountService();
