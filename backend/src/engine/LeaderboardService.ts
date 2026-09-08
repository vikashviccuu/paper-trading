import { prisma } from "../utils/prisma";

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
 * Ranks contest participants on a blend of return and risk, not raw return
 * alone - two participants who both made +10% can have very different risk
 * profiles (one held steady, one YOLO'd into weekly options and got lucky),
 * and a contest that only rewards raw return encourages exactly that kind of
 * reckless trading. So:
 *
 *   1. For each participant, build their NAV time series from
 *      ContestPortfolioSnapshot (periodic snapshots taken by
 *      ContestSnapshotScheduler).
 *   2. returnPct = total return over the contest so far.
 *      riskScore = standard deviation of period-over-period % returns
 *      (volatility) - higher means a bumpier equity curve.
 *      maxDrawdownPct = largest peak-to-trough decline, shown for context.
 *   3. Both metrics are z-score normalized *within the contest* (relative to
 *      other participants, not some absolute scale), then combined into
 *      compositeScore = contest.returnWeight * zReturn - contest.riskWeight * zRisk.
 *      Ranking is by compositeScore descending. Contest hosts control the
 *      return/risk tradeoff via Contest.returnWeight / Contest.riskWeight
 *      (e.g. a "steady hands" contest could set riskWeight much higher).
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

    const raw = participants.map((p) => {
      const navSeries = p.snapshots.map((s) => Number(s.nav));
      const series = navSeries.length > 0 ? navSeries : [startingCash];
      const lastNav = series[series.length - 1];

      const returnPct = ((lastNav - startingCash) / startingCash) * 100;
      const riskScore = volatilityPct(series);
      const maxDrawdownPct = maxDrawdown(series) * 100;

      return { participant: p, nav: lastNav, returnPct, riskScore, maxDrawdownPct };
    });

    const returnMean = mean(raw.map((r) => r.returnPct));
    const returnStd = stddev(raw.map((r) => r.returnPct)) || 1;
    const riskMean = mean(raw.map((r) => r.riskScore));
    const riskStd = stddev(raw.map((r) => r.riskScore)) || 1;

    const scored = raw.map((r) => {
      const zReturn = (r.returnPct - returnMean) / returnStd;
      const zRisk = (r.riskScore - riskMean) / riskStd;
      const compositeScore = contest.returnWeight * zReturn - contest.riskWeight * zRisk;
      return { ...r, compositeScore };
    });

    scored.sort((a, b) => b.compositeScore - a.compositeScore);

    const rows: LeaderboardRow[] = scored.map((r, idx) => ({
      contestParticipantId: r.participant.id,
      userId: r.participant.userId,
      name: r.participant.user.name,
      nav: round2(r.nav),
      returnPct: round2(r.returnPct),
      riskScore: round2(r.riskScore),
      maxDrawdownPct: round2(r.maxDrawdownPct),
      compositeScore: round2(r.compositeScore),
      rank: idx + 1,
    }));

    // Persist so the leaderboard endpoint can serve cached results between
    // snapshot cycles without recomputing (see routes/contests.routes.ts).
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
function volatilityPct(navSeries: number[]): number {
  if (navSeries.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < navSeries.length; i++) {
    const prev = navSeries[i - 1];
    if (prev === 0) continue;
    returns.push(((navSeries[i] - prev) / prev) * 100);
  }
  return stddev(returns);
}

/** Largest peak-to-trough decline as a fraction (0.15 = 15% drawdown). */
function maxDrawdown(navSeries: number[]): number {
  let peak = navSeries[0];
  let worst = 0;
  for (const nav of navSeries) {
    if (nav > peak) peak = nav;
    const drawdown = peak > 0 ? (peak - nav) / peak : 0;
    if (drawdown > worst) worst = drawdown;
  }
  return worst;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const leaderboardService = new LeaderboardService();
