import { prisma } from "../utils/prisma";

export interface PersonalDetailsInput {
  name?: string; // updates User.name
  dateOfBirth?: string; // ISO date
  gender?: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
}

export interface AddressDetailsInput {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface CommunicationDetailsInput {
  alternateEmail?: string;
}

/**
 * Personal / address / communication sections of the profile page. Phone
 * number changes go through OtpService (verifyPhoneStart/verifyPhoneConfirm
 * in kyc.routes... actually profile.routes) rather than this service
 * directly, since a phone number shouldn't silently become "verified" just
 * because someone typed a new one in a form.
 */
export class ProfileService {
  async getFullProfile(userId: string) {
    const [user, profile, kyc, bankAccounts] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, createdAt: true } }),
      this.getOrCreateProfile(userId),
      prisma.kyc.findUnique({ where: { userId }, include: { documents: true } }),
      prisma.bankAccount.findMany({ where: { userId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }),
    ]);
    return { user, profile, kyc, bankAccounts };
  }

  async getOrCreateProfile(userId: string) {
    return prisma.userProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async updatePersonal(userId: string, input: PersonalDetailsInput) {
    await this.getOrCreateProfile(userId);
    if (input.name) {
      await prisma.user.update({ where: { id: userId }, data: { name: input.name } });
    }
    return prisma.userProfile.update({
      where: { userId },
      data: {
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        gender: input.gender,
      },
    });
  }

  async updateAddress(userId: string, input: AddressDetailsInput) {
    await this.getOrCreateProfile(userId);
    return prisma.userProfile.update({ where: { userId }, data: input });
  }

  async updateCommunication(userId: string, input: CommunicationDetailsInput) {
    await this.getOrCreateProfile(userId);
    return prisma.userProfile.update({ where: { userId }, data: input });
  }

  /** Called only once phone OTP verification succeeds (see OtpService + routes/profile.routes.ts). */
  async setVerifiedPhone(userId: string, phone: string) {
    await this.getOrCreateProfile(userId);
    return prisma.userProfile.update({
      where: { userId },
      data: { phone, phoneVerified: true },
    });
  }

  /**
   * How contest winnings should be paid out - CASH_WITHDRAWAL (real payout
   * to a verified bank account) or PROP_TRADING (credited as trading
   * capital into the user's personal Wallet, no bank account needed).
   * Changing this never retroactively changes an already-computed
   * ContestPrizeAward (PrizeService snapshots the preference at computation
   * time) - see docs/PRIZES_AND_PAYOUTS.md.
   */
  async updatePayoutPreference(userId: string, preference: "CASH_WITHDRAWAL" | "PROP_TRADING") {
    await this.getOrCreateProfile(userId);
    return prisma.userProfile.update({ where: { userId }, data: { payoutPreference: preference } });
  }
}

export const profileService = new ProfileService();
