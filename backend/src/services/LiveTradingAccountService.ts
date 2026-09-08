import { prisma } from "../utils/prisma";
import { AppError } from "../engine/OrderEngine";
import { env } from "../config/env";

/**
 * Owns the LiveTradingAccount state machine - see the LiveTradingStatus enum
 * doc comment in schema.prisma and docs/LIVE_TRADING.md for the full
 * lifecycle: NOT_ELIGIBLE -> ELIGIBLE (a paid PROP_TRADING prize award, or
 * an admin grant) -> ENABLED (user links a broker + explicitly opts in,
 * never automatic) -> SUSPENDED (admin/risk override, always wins).
 */
export class LiveTradingAccountService {
  async getOrCreate(userId: string) {
    return prisma.liveTradingAccount.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        dailyOrderLimit: env.LIVE_DEFAULT_DAILY_ORDER_LIMIT,
        maxOrderValue: env.LIVE_DEFAULT_MAX_ORDER_VALUE,
      },
    });
  }

  /** Called by PrizeService when a PROP_TRADING award is successfully paid out - see docs/LIVE_TRADING.md and docs/PRIZES_AND_PAYOUTS.md. */
  async grantEligibility(userId: string) {
    const account = await this.getOrCreate(userId);
    if (account.status !== "NOT_ELIGIBLE") return account; // already eligible/enabled/suspended - don't downgrade
    return prisma.liveTradingAccount.update({
      where: { userId },
      data: { status: "ELIGIBLE", eligibleSince: new Date() },
    });
  }

  /** Admin can also grant eligibility directly (e.g. a manually-vetted funded trader), independent of any contest. */
  async adminGrantEligibility(userId: string) {
    const account = await this.getOrCreate(userId);
    if (account.status === "ENABLED" || account.status === "SUSPENDED") return account;
    return prisma.liveTradingAccount.update({
      where: { userId },
      data: { status: "ELIGIBLE", eligibleSince: account.eligibleSince ?? new Date() },
    });
  }

  /**
   * The explicit opt-in step: requires KYC VERIFIED and a linked broker.
   * Never called automatically by anything - a user must actively choose to
   * trade real money.
   */
  async linkBrokerAndEnable(userId: string, brokerLinkId: string) {
    const account = await this.getOrCreate(userId);
    if (account.status === "SUSPENDED") throw new AppError(403, "Your live trading account is suspended - contact support");
    if (account.status === "NOT_ELIGIBLE") throw new AppError(403, "You're not yet eligible for live trading");

    const kyc = await prisma.kyc.findUnique({ where: { userId } });
    if (!kyc || kyc.status !== "VERIFIED") throw new AppError(400, "Complete KYC verification before enabling live trading");

    const brokerLink = await prisma.brokerLink.findFirst({ where: { id: brokerLinkId, userId } });
    if (!brokerLink) throw new AppError(404, "Broker link not found");

    return prisma.liveTradingAccount.update({
      where: { userId },
      data: { status: "ENABLED", enabledAt: new Date(), brokerLinkId },
    });
  }

  /** User-initiated off switch - keeps eligibility (goes back to ELIGIBLE, not NOT_ELIGIBLE), can re-enable anytime. */
  async disable(userId: string) {
    const account = await this.getOrCreate(userId);
    if (account.status !== "ENABLED") return account;
    return prisma.liveTradingAccount.update({
      where: { userId },
      data: { status: "ELIGIBLE", enabledAt: null, brokerLinkId: null },
    });
  }

  /** Instant stop on new order placement without fully disabling/unlinking - see LiveOrderService, checked on every placeOrder call. */
  async setKillSwitch(userId: string, active: boolean) {
    await this.getOrCreate(userId);
    return prisma.liveTradingAccount.update({ where: { userId }, data: { killSwitchActive: active } });
  }

  async updateRiskLimits(userId: string, dailyOrderLimit: number, maxOrderValue: number) {
    if (dailyOrderLimit < 1 || dailyOrderLimit > env.LIVE_DEFAULT_DAILY_ORDER_LIMIT) {
      throw new AppError(400, `Daily order limit must be between 1 and ${env.LIVE_DEFAULT_DAILY_ORDER_LIMIT}`);
    }
    if (maxOrderValue < 1 || maxOrderValue > env.LIVE_DEFAULT_MAX_ORDER_VALUE) {
      throw new AppError(400, `Max order value must be between ₹1 and ₹${env.LIVE_DEFAULT_MAX_ORDER_VALUE}`);
    }
    await this.getOrCreate(userId);
    return prisma.liveTradingAccount.update({ where: { userId }, data: { dailyOrderLimit, maxOrderValue } });
  }

  async adminSuspend(adminId: string, userId: string, reason: string) {
    await this.getOrCreate(userId);
    return prisma.liveTradingAccount.update({
      where: { userId },
      data: { status: "SUSPENDED", suspendedByAdminId: adminId, suspendedReason: reason, suspendedAt: new Date() },
    });
  }

  /** Reinstates to ELIGIBLE (not straight back to ENABLED) - the user must explicitly re-enable, same as any first-time opt-in. */
  async adminReinstate(userId: string) {
    const account = await this.getOrCreate(userId);
    if (account.status !== "SUSPENDED") throw new AppError(400, "This account is not suspended");
    return prisma.liveTradingAccount.update({
      where: { userId },
      data: { status: "ELIGIBLE", suspendedByAdminId: null, suspendedReason: null, suspendedAt: null },
    });
  }

  async listAllForAdmin() {
    return prisma.liveTradingAccount.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        brokerLink: { select: { id: true, provider: true, nickname: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }
}

export const liveTradingAccountService = new LiveTradingAccountService();
