import { prisma } from "../utils/prisma";
import { AppError } from "../engine/OrderEngine";
import { getPayoutProvider } from "../payouts/PayoutProviderFactory";
import { liveTradingAccountService } from "./LiveTradingAccountService";
import { env } from "../config/env";

export interface PrizeSlabInput {
  rankFrom: number;
  rankTo: number;
  percentage: number; // % of Contest.totalPrizePool allocated to this rank range, split evenly across it
}

interface Eligibility {
  status: "PENDING_KYC" | "PENDING_BANK" | "READY";
  blockedReason?: string;
  bankSnapshot?: { id: string; last4: string; ifsc: string; accountHolderName: string; accountNumber: string };
}

/**
 * Turns a contest's prize pool + rank-based slabs into per-winner
 * ContestPrizeAward rows once the final leaderboard is locked, and handles
 * the admin "release payout" action. See docs/PRIZES_AND_PAYOUTS.md for the
 * full flow, the TDS calculation, and important regulatory caveats (this is
 * scaffolding, not a compliant real-money payout system on its own).
 *
 *   Contest.totalPrizePool + ContestPrizeSlab[]
 *     --(computeAwards, called by ContestEndService once, or manually)-->
 *   ContestPrizeAward[] { grossAmount, tdsAmount, netAmount, payoutStatus }
 *     --(admin reviews KYC/bank status, calls release)-->
 *   payoutStatus PAID (+ live-trading eligibility unlocked, if PROP_TRADING)
 *
 * No broker API can deposit real cash into a user's account on our behalf
 * (see docs/LIVE_TRADING.md) - so as of the live-trading feature, BOTH
 * payout preferences pay the net amount to the user's verified bank account
 * the same way. The only difference is what PROP_TRADING does *in addition*
 * to that payout: it unlocks Live Trading eligibility
 * (LiveTradingAccountService.grantEligibility), so the user can go trade
 * that (now real, in their bank account) capital through their own linked
 * broker. `PrizePayoutStatus.CREDITED_TO_WALLET` is kept in the schema for
 * backward-compatibility with the enum's earlier meaning ("credit to the
 * internal paper wallet") but is no longer set by this service.
 */
export class PrizeService {
  async getPrizeConfig(contestId: string) {
    const contest = await prisma.contest.findUniqueOrThrow({
      where: { id: contestId },
      select: { id: true, totalPrizePool: true, prizesComputedAt: true },
    });
    const slabs = await prisma.contestPrizeSlab.findMany({
      where: { contestId, isDeleted: false },
      orderBy: { rankFrom: "asc" },
    });
    return { totalPrizePool: contest.totalPrizePool, prizesComputedAt: contest.prizesComputedAt, slabs };
  }

  async setPrizeConfig(contestId: string, totalPrizePool: number, slabs: PrizeSlabInput[]) {
    const contest = await prisma.contest.findUniqueOrThrow({ where: { id: contestId } });
    if (contest.prizesComputedAt) {
      throw new AppError(400, "Prize awards have already been computed for this contest - pool and slabs are locked");
    }
    if (totalPrizePool < 0) throw new AppError(400, "Prize pool cannot be negative");
    this.validateSlabs(slabs);

    await prisma.$transaction([
      prisma.contest.update({ where: { id: contestId }, data: { totalPrizePool } }),
      // Soft-archive existing slabs - NEVER HARD DELETE
      prisma.contestPrizeSlab.updateMany({
        where: { contestId, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      }),
      ...(slabs.length > 0
        ? [
            prisma.contestPrizeSlab.createMany({
              data: slabs.map((s) => ({
                contestId,
                rankFrom: s.rankFrom,
                rankTo: s.rankTo,
                percentage: s.percentage,
                isDeleted: false,
                deletedAt: null,
              })),
            }),
          ]
        : []),
    ]);
    return this.getPrizeConfig(contestId);
  }

  private validateSlabs(slabs: PrizeSlabInput[]) {
    let totalPct = 0;
    const seenRanks = new Set<number>();
    for (const s of slabs) {
      if (!Number.isInteger(s.rankFrom) || !Number.isInteger(s.rankTo) || s.rankFrom < 1 || s.rankTo < s.rankFrom) {
        throw new AppError(400, `Invalid rank range ${s.rankFrom}-${s.rankTo}`);
      }
      if (s.percentage <= 0) throw new AppError(400, "Slab percentage must be positive");
      for (let r = s.rankFrom; r <= s.rankTo; r++) {
        if (seenRanks.has(r)) throw new AppError(400, `Rank ${r} appears in more than one prize slab`);
        seenRanks.add(r);
      }
      totalPct += s.percentage;
    }
    if (totalPct > 100.001) throw new AppError(400, `Prize slabs sum to ${totalPct.toFixed(2)}% - cannot exceed 100%`);
  }

  /**
   * Idempotent via Contest.prizesComputedAt - safe to call more than once
   * (e.g. ContestEndService calling it automatically right after an admin
   * had already triggered it manually). Requires the leaderboard to already
   * be scored (LeaderboardService.computeLeaderboard must have run at least
   * once - true for any ENDED contest).
   */
  async computeAwards(contestId: string) {
    const contest = await prisma.contest.findUniqueOrThrow({ where: { id: contestId }, include: { prizeSlabs: true } });
    if (contest.prizesComputedAt) return { contestId, alreadyComputed: true, awardsCreated: 0 };

    if (Number(contest.totalPrizePool) <= 0 || contest.prizeSlabs.length === 0) {
      await prisma.contest.update({ where: { id: contestId }, data: { prizesComputedAt: new Date() } });
      return { contestId, alreadyComputed: false, awardsCreated: 0 };
    }

    const participants = await prisma.contestParticipant.findMany({
      where: { contestId, rank: { not: null } },
      include: { user: { include: { profile: true, kyc: true, bankAccounts: true } } },
    });
    const byRank = new Map(participants.map((p) => [p.rank as number, p]));

    const totalPool = Number(contest.totalPrizePool);
    let awardsCreated = 0;

    for (const slab of contest.prizeSlabs) {
      const winnersInSlab = slab.rankTo - slab.rankFrom + 1;
      const slabAmount = totalPool * (slab.percentage / 100);
      const perWinner = slabAmount / winnersInSlab;

      for (let rank = slab.rankFrom; rank <= slab.rankTo; rank++) {
        const participant = byRank.get(rank);
        if (!participant) continue; // fewer entrants than this slab's rank range

        const gross = round2(perWinner);
        const tdsRate = env.TDS_RATE_PCT;
        const tds = round2((gross * tdsRate) / 100);
        const net = round2(gross - tds);
        const preference: "CASH_WITHDRAWAL" | "PROP_TRADING" = participant.user.profile?.payoutPreference ?? "CASH_WITHDRAWAL";

        const eligibility = this.determineEligibility(participant.user.kyc, participant.user.bankAccounts, preference);

        await prisma.contestPrizeAward.upsert({
          where: { contestId_userId: { contestId, userId: participant.userId } },
          create: {
            contestId,
            contestParticipantId: participant.id,
            userId: participant.userId,
            rank,
            grossAmount: gross,
            tdsRatePct: tdsRate,
            tdsAmount: tds,
            netAmount: net,
            payoutPreference: preference,
            payoutStatus: eligibility.status,
            blockedReason: eligibility.blockedReason,
            payoutBankAccountId: eligibility.bankSnapshot?.id,
            payoutAccountLast4: eligibility.bankSnapshot?.last4,
            payoutIfsc: eligibility.bankSnapshot?.ifsc,
          },
          update: {}, // computeAwards is meant to run once per contest (guarded above) - never silently re-price an existing award
        });
        awardsCreated++;
      }
    }

    await prisma.contest.update({ where: { id: contestId }, data: { prizesComputedAt: new Date() } });
    return { contestId, alreadyComputed: false, awardsCreated };
  }

  /**
   * KYC verified + a verified bank account - required for BOTH payout
   * preferences now, since every award pays real money to the bank (no
   * broker API can deposit cash on our behalf - see docs/LIVE_TRADING.md).
   * `preference` is accepted for signature stability / potential future
   * per-preference rules but no longer branches the check.
   */
  private determineEligibility(kyc: any, bankAccounts: any[], _preference: "CASH_WITHDRAWAL" | "PROP_TRADING"): Eligibility {
    if (!kyc || kyc.status !== "VERIFIED") {
      return { status: "PENDING_KYC", blockedReason: "KYC is not verified yet" };
    }
    const verified: any[] = bankAccounts.filter((b) => b.verificationStatus === "VERIFIED");
    const primary = verified.find((b) => b.isPrimary) ?? verified[0];
    if (!primary) {
      return { status: "PENDING_BANK", blockedReason: "No verified bank account on file" };
    }
    return {
      status: "READY",
      bankSnapshot: {
        id: primary.id,
        last4: String(primary.accountNumber).slice(-4),
        ifsc: primary.ifsc,
        accountHolderName: primary.accountHolderName,
        accountNumber: primary.accountNumber,
      },
    };
  }

  /**
   * Awards for the admin prize/payout page - joins in each winner's current
   * KYC status and verified-bank-account count so the admin can see at a
   * glance why an award is (or isn't) READY, without a second round trip.
   */
  async listForContest(contestId: string) {
    const awards = await prisma.contestPrizeAward.findMany({
      where: { contestId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            kyc: { select: { status: true } },
            bankAccounts: { select: { id: true, isPrimary: true, verificationStatus: true, accountNumber: true, ifsc: true } },
          },
        },
      },
      orderBy: { rank: "asc" },
    });
    return awards.map((a) => ({
      ...a,
      user: {
        id: a.user.id,
        name: a.user.name,
        email: a.user.email,
        kycStatus: a.user.kyc?.status ?? "NOT_STARTED",
        verifiedBankAccountCount: a.user.bankAccounts.filter((b) => b.verificationStatus === "VERIFIED").length,
      },
    }));
  }

  async getMyAward(contestId: string, userId: string) {
    return prisma.contestPrizeAward.findUnique({ where: { contestId_userId: { contestId, userId } } });
  }

  /**
   * Re-checks KYC/bank eligibility for one award without touching the
   * already-computed amounts - lets an admin refresh a PENDING_KYC/
   * PENDING_BANK award after the user finishes verification, without
   * recomputing the whole contest's prize pool.
   */
  async recomputeEligibility(awardId: string) {
    const award = await prisma.contestPrizeAward.findUniqueOrThrow({
      where: { id: awardId },
      include: { user: { include: { kyc: true, bankAccounts: true } } },
    });
    if (award.payoutStatus === "PAID" || award.payoutStatus === "CREDITED_TO_WALLET" || award.payoutStatus === "PROCESSING") {
      return award; // don't disturb a finished/in-flight payout
    }
    const eligibility = this.determineEligibility(award.user.kyc, award.user.bankAccounts, award.payoutPreference);
    return prisma.contestPrizeAward.update({
      where: { id: award.id },
      data: {
        payoutStatus: eligibility.status,
        blockedReason: eligibility.blockedReason,
        payoutBankAccountId: eligibility.bankSnapshot?.id ?? award.payoutBankAccountId,
        payoutAccountLast4: eligibility.bankSnapshot?.last4 ?? award.payoutAccountLast4,
        payoutIfsc: eligibility.bankSnapshot?.ifsc ?? award.payoutIfsc,
      },
    });
  }

  /**
   * Admin-only. Re-validates eligibility right before paying (never trusts
   * a stale READY from computeAwards time). Always pays netAmount to the
   * user's verified bank account via the configured IPayoutProvider - no
   * broker API can deposit cash into a user's account on our behalf, so
   * PROP_TRADING is no longer a different money-movement path (see the
   * class docblock and docs/LIVE_TRADING.md). On a successful PROP_TRADING
   * payout, additionally grants the user Live Trading eligibility.
   */
  async release(adminId: string, awardId: string) {
    let award = await this.recomputeEligibility(awardId);
    if (award.payoutStatus === "PAID" || award.payoutStatus === "CREDITED_TO_WALLET") {
      throw new AppError(400, "This award has already been paid out");
    }
    if (award.payoutStatus === "PROCESSING") {
      throw new AppError(409, "A payout is already in flight for this award");
    }
    if (award.payoutStatus !== "READY") {
      throw new AppError(400, award.blockedReason ?? "This award is not ready for payout yet");
    }

    await prisma.contestPrizeAward.update({ where: { id: award.id }, data: { payoutStatus: "PROCESSING" } });
    const provider = getPayoutProvider();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: award.userId }, select: { name: true } });
    try {
      const result = await provider.initiatePayout(
        {
          beneficiaryId: `award_${award.id}`,
          name: user.name,
          accountNumber: (await this.currentBankAccountNumber(award)) ?? "",
          ifsc: award.payoutIfsc ?? "",
        },
        Number(award.netAmount),
        award.id,
        `Contest prize payout - rank ${award.rank}`
      );

      const updated = await prisma.contestPrizeAward.update({
        where: { id: award.id },
        data: {
          payoutStatus: result.success ? "PAID" : "FAILED",
          payoutProvider: provider.providerName,
          payoutRaw: result.raw as any,
          releasedByAdminId: adminId,
          paidAt: result.success ? new Date() : null,
          blockedReason: result.success ? null : result.failureReason ?? "Payout provider reported failure",
        },
      });

      if (result.success && award.payoutPreference === "PROP_TRADING") {
        await liveTradingAccountService.grantEligibility(award.userId);
        return prisma.contestPrizeAward.update({
          where: { id: award.id },
          data: { unlockedLiveTradingEligibility: true, liveTradingEligibilityGrantedAt: new Date() },
        });
      }
      return updated;
    } catch (err: any) {
      return prisma.contestPrizeAward.update({
        where: { id: award.id },
        data: {
          payoutStatus: "FAILED",
          payoutProvider: provider.providerName,
          blockedReason: err?.message ?? "Payout provider call failed",
        },
      });
    }
  }

  /** The award only snapshots masked last-4 for display - fetch the full number fresh at payout time. */
  private async currentBankAccountNumber(award: { payoutBankAccountId: string | null }): Promise<string | null> {
    if (!award.payoutBankAccountId) return null;
    const account = await prisma.bankAccount.findUnique({ where: { id: award.payoutBankAccountId } });
    return account?.accountNumber ?? null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const prizeService = new PrizeService();
