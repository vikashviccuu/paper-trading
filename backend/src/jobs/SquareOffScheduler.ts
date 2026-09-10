import cron from "node-cron";
import { prisma } from "../utils/prisma";
import { getBrokerAdapter } from "../brokers/BrokerFactory";
import { portfolioService } from "../engine/PortfolioService";
import { env } from "../config/env";

/**
 * Mimics NSE/broker intraday auto-square-off: any INTRADAY (MIS) position
 * still open at INTRADAY_SQUAREOFF_TIME (default 15:20 IST) is closed at
 * the current market price and its margin released. Runs every minute and
 * only acts once the clock passes the configured cutoff, on trading days.
 */
export function startSquareOffScheduler() {
  const [hh, mm] = env.INTRADAY_SQUAREOFF_TIME.split(":").map(Number);

  // Runs every minute; internally checks whether we've crossed the cutoff.
  cron.schedule("* * * * 1-5", async () => {
    const now = new Date();
    if (now.getHours() !== hh || now.getMinutes() !== mm) return;
    await squareOffAllIntraday();
  });
}

export async function squareOffAllIntraday() {
  const positions = await prisma.position.findMany({
    where: { productType: "INTRADAY", isClosed: false, quantity: { not: 0 } },
    include: { instrument: true },
  });
  if (positions.length === 0) return;

  const broker = getBrokerAdapter();
  for (const pos of positions) {
    const [quote] = await broker.getQuote([pos.instrument.instrumentToken]).catch(() => [null]);
    const ltp = quote?.lastPrice ?? Number(pos.instrument.lastPrice ?? pos.avgPrice);

    const direction = pos.quantity > 0 ? 1 : -1;
    const realizedPnL = direction * Math.abs(pos.quantity) * (ltp - Number(pos.avgPrice));

    await prisma.$transaction([
      prisma.position.update({
        where: { id: pos.id },
        data: {
          quantity: 0,
          marginBlocked: 0,
          isClosed: true,
          closedAt: new Date(),
          realizedPnL: { increment: realizedPnL },
        },
      }),
      prisma.wallet.update({
        where: { userId: pos.userId },
        data: {
          cashBalance: { increment: Number(pos.marginBlocked) + realizedPnL },
          marginUsed: { decrement: Number(pos.marginBlocked) },
          realizedPnL: { increment: realizedPnL },
        },
      }),
      prisma.order.create({
        data: {
          userId: pos.userId,
          instrumentId: pos.instrumentId,
          transactionType: pos.quantity > 0 ? "SELL" : "BUY",
          orderType: "MARKET",
          productType: "INTRADAY",
          quantity: Math.abs(pos.quantity),
          filledPrice: ltp,
          status: "COMPLETE",
          rejectionReason: "AUTO_SQUARE_OFF",
        },
      }),
    ]);
  }
}
