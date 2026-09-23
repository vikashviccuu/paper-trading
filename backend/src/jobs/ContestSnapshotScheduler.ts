import cron from "node-cron";
import { prisma } from "../utils/prisma";
import { contestPortfolioService } from "../engine/ContestPortfolioService";
import { leaderboardService } from "../engine/LeaderboardService";
import { contestEndService } from "../engine/ContestEndService";

/**
 * Every 15 minutes: (1) flips contests UPCOMING->ACTIVE once their
 * startDate passes, (2) force-closes (auto square-off, both intraday and
 * delivery/carry-forward) and finalizes the leaderboard for any contest
 * whose endDate has passed - see engine/ContestEndService.ts - and
 * (3) takes a NAV snapshot + refreshes the leaderboard for every other
 * still-ACTIVE contest. This snapshot cadence is what the risk
 * (volatility/drawdown) side of the leaderboard scoring is built on - see
 * docs/CONTESTS.md and engine/LeaderboardService.ts for the scoring model.
 *
 * 15 minutes is coarse enough that a contest's actual square-off can lag its
 * endDate (market close) by up to that long. Shorten the cron expression
 * below for contests where that matters (e.g. short intraday-only contests).
 */
export function startContestSnapshotScheduler() {
  const currentEnv = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
  const isTestEnv = ["local", "development", "dev", "qc", "uat", "staging"].includes(currentEnv);
  const cronSchedule = isTestEnv ? "* * * * *" : "*/15 * * * *";

  console.log(`[ContestScheduler] Initializing contest snapshot scheduler on cadence: ${cronSchedule} (env=${currentEnv})`);

  cron.schedule(cronSchedule, async () => {
    await activateUpcomingContests();
    await endExpiredContests();
    await snapshotAndScoreActiveContests();
  });
}

export async function activateUpcomingContests() {
  await prisma.contest.updateMany({
    where: { status: "UPCOMING", startDate: { lte: new Date() } },
    data: { status: "ACTIVE" },
  });
}

/** Auto square-off: any ACTIVE contest whose endDate (market close on its last day) has passed. */
export async function endExpiredContests() {
  const expired = await prisma.contest.findMany({
    where: { status: "ACTIVE", endDate: { lt: new Date() } },
    select: { id: true },
  });
  for (const contest of expired) {
    await contestEndService.endContest(contest.id).catch((err) => {
      console.error(`Contest end square-off failed for ${contest.id}:`, err);
    });
  }
}

export async function snapshotAndScoreActiveContests() {
  const activeContests = await prisma.contest.findMany({
    where: { status: "ACTIVE" },
    include: { participants: true },
  });

  for (const contest of activeContests) {
    for (const participant of contest.participants) {
      const nav = await contestPortfolioService.computeNav(participant.id).catch(() => null);
      if (nav == null) continue;
      await prisma.contestPortfolioSnapshot.create({
        data: { contestParticipantId: participant.id, nav },
      });
    }
    await leaderboardService.computeLeaderboard(contest.id).catch((err) => {
      console.error(`Leaderboard computation failed for contest ${contest.id}:`, err);
    });
  }
}
