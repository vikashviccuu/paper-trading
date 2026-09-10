import { prisma } from "../utils/prisma";
import { getBrokerAdapter } from "../brokers/BrokerFactory";
import { contestPortfolioService } from "./ContestPortfolioService";
import { leaderboardService } from "./LeaderboardService";
import { prizeService } from "../services/PrizeService";

/**
 * Runs once, at the close of a contest's last trading day: force-closes
 * every participant's open ContestPosition and ContestHolding - both
 * intraday and delivery/carry-forward - at the then-current market price,
 * realizes the P&L into each participant's virtual cash, and locks the
 * final leaderboard. This is what "on last day closing of market all
 * positions will square off automatically" means for contests (as opposed
 * to jobs/SquareOffScheduler.ts, which only auto-squares-off INTRADAY
 * positions in *personal* accounts every trading day).
 *
 * Idempotent: guarded by Contest.squaredOffAt, so re-invoking (e.g. an
 * admin's manual "End Now" followed by the next scheduler tick finding the
 * same contest still ACTIVE for a moment) is a safe no-op the second time.
 */
export class ContestEndService {
  async endContest(contestId: string) {
    const contest = await prisma.contest.findUniqueOrThrow({ where: { id: contestId } });
    if (contest.squaredOffAt) {
      return { contestId, alreadySquaredOff: true };
    }

    const participants = await prisma.contestParticipant.findMany({
      where: { contestId },
      include: {
        positions: { where: { isClosed: false, quantity: { not: 0 } }, include: { instrument: true } },
        holdings: { where: { isDeleted: false, quantity: { gt: 0 } }, include: { instrument: true } },
      },
    });

    const allTokens = Array.from(
      new Set(
        participants.flatMap((p) => [
          ...p.positions.map((x) => x.instrument.instrumentToken),
          ...p.holdings.map((x) => x.instrument.instrumentToken),
        ])
      )
    );

    const broker = getBrokerAdapter();
    const quotes = allTokens.length > 0 ? await broker.getQuote(allTokens).catch(() => []) : [];
    const ltpByToken = new Map(quotes.map((q) => [q.instrumentToken, q.lastPrice]));

    let positionsClosed = 0;
    let holdingsClosed = 0;

    for (const participant of participants) {
      for (const pos of participant.positions) {
        const ltp = ltpByToken.get(pos.instrument.instrumentToken) ?? Number(pos.instrument.lastPrice ?? pos.avgPrice);
        const direction = pos.quantity > 0 ? 1 : -1;
        const realizedPnL = direction * Math.abs(pos.quantity) * (ltp - Number(pos.avgPrice));
        const marginBlocked = Number(pos.marginBlocked);

        await prisma.$transaction([
          prisma.contestPosition.update({
            where: { id: pos.id },
            data: {
              quantity: 0,
              marginBlocked: 0,
              isClosed: true,
              closedAt: new Date(),
              realizedPnL: { increment: realizedPnL },
            },
          }),
          prisma.contestParticipant.update({
            where: { id: participant.id },
            data: {
              cashBalance: { increment: marginBlocked + realizedPnL },
              marginUsed: { decrement: marginBlocked },
              realizedPnL: { increment: realizedPnL },
            },
          }),
          prisma.order.create({
            data: {
              userId: participant.userId,
              contestParticipantId: participant.id,
              instrumentId: pos.instrumentId,
              transactionType: pos.quantity > 0 ? "SELL" : "BUY",
              orderType: "MARKET",
              productType: pos.productType,
              quantity: Math.abs(pos.quantity),
              filledPrice: ltp,
              status: "COMPLETE",
              rejectionReason: "CONTEST_END_SQUAREOFF",
            },
          }),
        ]);
        positionsClosed++;
      }

      for (const holding of participant.holdings) {
        const ltp = ltpByToken.get(holding.instrument.instrumentToken) ?? Number(holding.instrument.lastPrice ?? holding.avgPrice);
        const direction = holding.quantity > 0 ? 1 : -1;
        const realizedPnL = direction * Math.abs(holding.quantity) * (ltp - Number(holding.avgPrice));

        await prisma.$transaction([
          prisma.contestHolding.update({
            where: { id: holding.id },
            data: {
              quantity: 0,
              isDeleted: true,
              deletedAt: new Date(),
            },
          }),
          prisma.contestParticipant.update({
            where: { id: participant.id },
            data: {
              cashBalance: { increment: realizedPnL },
              realizedPnL: { increment: realizedPnL },
            },
          }),
          prisma.order.create({
            data: {
              userId: participant.userId,
              contestParticipantId: participant.id,
              instrumentId: holding.instrumentId,
              transactionType: holding.quantity > 0 ? "SELL" : "BUY",
              orderType: "MARKET",
              productType: "DELIVERY",
              quantity: Math.abs(holding.quantity),
              filledPrice: ltp,
              status: "COMPLETE",
              rejectionReason: "CONTEST_END_SQUAREOFF",
            },
          }),
        ]);
        holdingsClosed++;
      }

      // Final NAV after liquidation is just cash (no open positions/holdings
      // left), but recording it as an explicit snapshot keeps the NAV series
      // complete and gives LeaderboardService a clean final data point.
      const finalNav = await contestPortfolioService.computeNav(participant.id);
      await prisma.contestPortfolioSnapshot.create({
        data: { contestParticipantId: participant.id, nav: finalNav },
      });
    }

    await prisma.contest.update({
      where: { id: contestId },
      data: { status: "ENDED", squaredOffAt: new Date() },
    });

    const leaderboard = await leaderboardService.computeLeaderboard(contestId);

    // Ranks are now locked in - safe to turn the prize pool (if any) into
    // per-winner awards. No-op (and cheap) for contests with no prize pool.
    const prizeAwards = await prizeService.computeAwards(contestId);

    return { contestId, participantsClosed: participants.length, positionsClosed, holdingsClosed, leaderboard, prizeAwards };
  }
}

export const contestEndService = new ContestEndService();
