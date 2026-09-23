import { prisma } from "../utils/prisma";
import { contestPortfolioService } from "./ContestPortfolioService";

export interface LeaderboardRow {
  contestParticipantId: string;
  userId: string;
  name: string;
  nav: number;
  returnPct: number;
  riskScore: number; // volatility of the NAV return series, in %
  maxDrawdownPct: number;
  compositeScore: number;
  rank: number;
}

/**
 * Leaderboard Ranking Engine:
 * Ranks contest participants on a balanced blend of Return and Risk.
 *
 * Core Mathematical Formulations:
 * 1. Current Net Asset Value (NAV):
 *    NAV = CashBalance + MarginUsed + sum(Unrealised PnL of open positions and holdings)
 *
 * 2. Total Percentage Return (Return %):
 *    Return % = ((Current NAV - StartingVirtualCash) / StartingVirtualCash) * 100
 *
 * 3. Risk (Volatility %):
 *    Sample standard deviation of period-over-period percentage returns across the NAV equity curve:
 *    R_i = ((NAV_i - NAV_{i-1}) / NAV_{i-1}) * 100
 *    Volatility = sqrt( (1 / (K - 1)) * sum((R_i - mean(R))^2) )
 *
 * 4. Maximum Drawdown (MDD %):
 *    MDD % = max_t ( (Peak_t - NAV_t) / Peak_t ) * 100
 *
 * 5. Composite Score (Risk-Adjusted Performance):
 *    Composite Score = (ReturnWeight * Return %) - (RiskWeight * RiskScore)
 *    Default weights: ReturnWeight = 0.60, RiskWeight = 0.40
 *
 * Deterministic Tie-Breaking Hierarchy:
 *   1. Composite Score (descending)
 *   2. Return % (descending)
 *   3. Maximum Drawdown % (ascending, lower is better)
 *   4. Risk / Volatility % (ascending, lower is better)
 *   5. Registration joinedAt (ascending, earlier is better)
 */
export class LeaderboardService {
  async computeLeaderboard(contestId: string): Promise<LeaderboardRow[]> {
    const contest = await prisma.contest.findUniqueOrThrow({ where: { id: contestId } });
    const participants = await prisma.contestParticipant.findMany({
      where: { contestId },
      include: {
        user: true,
        snapshots: { orderBy: { timestamp: "asc" } },
      },
    });

    const startingCash = Number(contest.startingVirtualCash);

    const raw = await Promise.all(
      participants.map(async (p) => {
        // Fetch real-time live NAV for participant
        let currentNav = await contestPortfolioService.computeNav(p.id).catch(() => null);
        if (currentNav == null || isNaN(currentNav) || currentNav <= 0) {
          currentNav = Number(p.cashBalance) + Number(p.marginUsed);
        }

        const snapshotNavs = p.snapshots
          .map((s) => Number(s.nav))
          .filter((n) => !isNaN(n) && n > 0);

        const series: number[] = [];
        if (snapshotNavs.length === 0) {
          series.push(startingCash);
        } else {
          series.push(...snapshotNavs);
        }

        // Append current live NAV if it's new or not yet captured in snapshots
        if (series.length === 0 || Math.abs(series[series.length - 1] - currentNav) > 0.01) {
          series.push(currentNav);
        }

        const returnPct = ((currentNav - startingCash) / startingCash) * 100;
        const riskScore = volatilityPct(series);
        const maxDrawdownPct = maxDrawdown(series) * 100;

        const returnWeight = Number(contest.returnWeight ?? 0.6);
        const riskWeight = Number(contest.riskWeight ?? 0.4);
        const compositeScore = returnWeight * returnPct - riskWeight * riskScore;

        return {
          participant: p,
          nav: currentNav,
          returnPct,
          riskScore,
          maxDrawdownPct,
          compositeScore,
        };
      })
    );

    // Multi-tiered ranking sort:
    raw.sort((a, b) => {
      // 1. Composite Score (descending)
      if (Math.abs(b.compositeScore - a.compositeScore) > 0.0001) {
        return b.compositeScore - a.compositeScore;
      }
      // 2. Return % (descending)
      if (Math.abs(b.returnPct - a.returnPct) > 0.0001) {
        return b.returnPct - a.returnPct;
      }
      // 3. Max Drawdown % (ascending - lower drawdown is better)
      if (Math.abs(a.maxDrawdownPct - b.maxDrawdownPct) > 0.0001) {
        return a.maxDrawdownPct - b.maxDrawdownPct;
      }
      // 4. Risk / Volatility % (ascending - lower volatility is better)
      if (Math.abs(a.riskScore - b.riskScore) > 0.0001) {
        return a.riskScore - b.riskScore;
      }
      // 5. Earlier participant joinedAt breaks tie
      return new Date(a.participant.joinedAt).getTime() - new Date(b.participant.joinedAt).getTime();
    });

    const rows: LeaderboardRow[] = raw.map((r, idx) => ({
      contestParticipantId: r.participant.id,
      userId: r.participant.userId,
      name: r.participant.user.name,
      nav: round2(r.nav),
      returnPct: round2(r.returnPct),
      riskScore: round2(r.riskScore),
      maxDrawdownPct: round2(r.maxDrawdownPct),
      compositeScore: round3(r.compositeScore),
      rank: idx + 1,
    }));

    // Persist so the leaderboard endpoint can serve cached results between
    // snapshot cycles without recomputing (see routes/contests.routes.ts).
    if (rows.length > 0) {
      await prisma.$transaction(
        rows.map((row) =>
          prisma.contestParticipant.update({
            where: { id: row.contestParticipantId },
            data: {
              rank: row.rank,
              returnPct: row.returnPct,
              riskScore: row.riskScore,
              maxDrawdownPct: row.maxDrawdownPct,
              compositeScore: row.compositeScore,
              lastScoredAt: new Date(),
            },
          })
        )
      );
    }

    return rows;
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Standard deviation of period-over-period % returns across a NAV series. */
export function volatilityPct(navSeries: number[]): number {
  if (navSeries.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < navSeries.length; i++) {
    const prev = navSeries[i - 1];
    if (prev <= 0) continue;
    returns.push(((navSeries[i] - prev) / prev) * 100);
  }
  if (returns.length === 0) return 0;
  if (returns.length === 1) {
    return Math.abs(returns[0]);
  }
  return stddev(returns);
}

/** Largest peak-to-trough decline as a fraction (0.15 = 15% drawdown). */
export function maxDrawdown(navSeries: number[]): number {
  if (navSeries.length === 0) return 0;
  let peak = navSeries[0];
  let worst = 0;
  for (const nav of navSeries) {
    if (nav > peak) peak = nav;
    const drawdown = peak > 0 ? (peak - nav) / peak : 0;
    if (drawdown > worst) worst = drawdown;
  }
  return worst;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const leaderboardService = new LeaderboardService();
