import { prisma } from "../utils/prisma";
import { Prisma } from "@prisma/client";

/**
 * Mirrors PortfolioService.ts exactly, but against the contest-scoped
 * tables (ContestParticipant / ContestPosition / ContestHolding) instead of
 * the user's personal Wallet / Position / Holding. Kept as a separate class
 * rather than parameterizing PortfolioService because the two ledgers must
 * never be mixed - a contest order should be mathematically impossible to
 * apply to a user's personal portfolio and vice versa (see OrderEngine,
 * which picks one or the other per order based on contestParticipantId).
 */
export class ContestPortfolioService {
  async blockMargin(contestParticipantId: string, amount: number) {
    return prisma.contestParticipant.update({
      where: { id: contestParticipantId },
      data: {
        cashBalance: { decrement: amount },
        marginUsed: { increment: amount },
      },
    });
  }

  async releaseMargin(contestParticipantId: string, amount: number) {
    return prisma.contestParticipant.update({
      where: { id: contestParticipantId },
      data: {
        cashBalance: { increment: amount },
        marginUsed: { decrement: amount },
      },
    });
  }

  async applyRealizedPnL(contestParticipantId: string, pnl: number) {
    return prisma.contestParticipant.update({
      where: { id: contestParticipantId },
      data: {
        cashBalance: { increment: pnl },
        realizedPnL: { increment: pnl },
      },
    });
  }

  async applyFill(params: {
    contestParticipantId: string;
    instrumentId: string;
    productType: "INTRADAY" | "DELIVERY" | "NORMAL";
    transactionType: "BUY" | "SELL";
    quantity: number;
    fillPrice: number;
  }): Promise<{ realizedPnL: number }> {
    const { contestParticipantId, instrumentId, productType, transactionType, quantity, fillPrice } = params;
    const signedQty = transactionType === "BUY" ? quantity : -quantity;

    if (productType === "DELIVERY") {
      return this.applyHoldingFill(contestParticipantId, instrumentId, signedQty, fillPrice);
    }
    return this.applyPositionFill(contestParticipantId, instrumentId, productType, signedQty, fillPrice);
  }

  private async applyPositionFill(
    contestParticipantId: string,
    instrumentId: string,
    productType: "INTRADAY" | "NORMAL",
    signedQty: number,
    fillPrice: number
  ): Promise<{ realizedPnL: number }> {
    const existing = await prisma.contestPosition.findUnique({
      where: { contestParticipantId_instrumentId_productType: { contestParticipantId, instrumentId, productType } },
    });

    if (!existing) {
      await prisma.contestPosition.create({
        data: { contestParticipantId, instrumentId, productType, quantity: signedQty, avgPrice: new Prisma.Decimal(fillPrice) },
      });
      return { realizedPnL: 0 };
    }

    const existingQty = existing.quantity;
    const existingAvg = Number(existing.avgPrice);
    const sameDirection = Math.sign(existingQty || 1) === Math.sign(signedQty);

    if (sameDirection) {
      const newQty = existingQty + signedQty;
      const newAvg = (Math.abs(existingQty) * existingAvg + Math.abs(signedQty) * fillPrice) / Math.abs(newQty);
      await prisma.contestPosition.update({
        where: { id: existing.id },
        data: { quantity: newQty, avgPrice: new Prisma.Decimal(newAvg) },
      });
      return { realizedPnL: 0 };
    }

    const closingQty = Math.min(Math.abs(existingQty), Math.abs(signedQty));
    const direction = existingQty > 0 ? 1 : -1;
    const realizedPnL = direction * closingQty * (fillPrice - existingAvg);
    const remainder = existingQty + signedQty;

    if (remainder === 0) {
      // Retain closed contest position with quantity 0 - NEVER HARD DELETE
      await prisma.contestPosition.update({
        where: { id: existing.id },
        data: {
          quantity: 0,
          avgPrice: new Prisma.Decimal(existingAvg),
          realizedPnL: { increment: realizedPnL },
          marginBlocked: 0,
          isClosed: true,
          closedAt: new Date(),
        },
      });
    } else {
      const flipped = Math.sign(remainder) !== Math.sign(existingQty);
      await prisma.contestPosition.update({
        where: { id: existing.id },
        data: {
          quantity: remainder,
          avgPrice: new Prisma.Decimal(flipped ? fillPrice : existingAvg),
          realizedPnL: { increment: realizedPnL },
          isClosed: false,
          closedAt: null,
        },
      });
    }
    return { realizedPnL };
  }

  private async applyHoldingFill(
    contestParticipantId: string,
    instrumentId: string,
    signedQty: number,
    fillPrice: number
  ): Promise<{ realizedPnL: number }> {
    const existing = await prisma.contestHolding.findUnique({
      where: { contestParticipantId_instrumentId: { contestParticipantId, instrumentId } },
    });

    if (!existing) {
      await prisma.contestHolding.create({
        data: {
          contestParticipantId,
          instrumentId,
          quantity: signedQty,
          avgPrice: new Prisma.Decimal(fillPrice),
          isDeleted: false,
          deletedAt: null,
        },
      });
      return { realizedPnL: 0 };
    }

    // Reactivate soft-deleted or 0-quantity holding
    if (existing.isDeleted || existing.quantity === 0) {
      await prisma.contestHolding.update({
        where: { id: existing.id },
        data: {
          quantity: signedQty,
          avgPrice: new Prisma.Decimal(fillPrice),
          isDeleted: false,
          deletedAt: null,
        },
      });
      return { realizedPnL: 0 };
    }

    const existingQty = existing.quantity;
    const existingAvg = Number(existing.avgPrice);

    if (Math.sign(existingQty || 1) === Math.sign(signedQty)) {
      const newQty = existingQty + signedQty;
      const newAvg = (Math.abs(existingQty) * existingAvg + Math.abs(signedQty) * fillPrice) / Math.abs(newQty);
      await prisma.contestHolding.update({
        where: { id: existing.id },
        data: { quantity: newQty, avgPrice: new Prisma.Decimal(newAvg), isDeleted: false, deletedAt: null },
      });
      return { realizedPnL: 0 };
    }

    const closingQty = Math.min(Math.abs(existingQty), Math.abs(signedQty));
    const direction = existingQty > 0 ? 1 : -1;
    const realizedPnL = direction * closingQty * (fillPrice - existingAvg);
    const remainder = existingQty + signedQty;

    if (remainder === 0) {
      // Retain holding record with quantity 0 and isDeleted = true - NEVER HARD DELETE
      await prisma.contestHolding.update({
        where: { id: existing.id },
        data: { quantity: 0, isDeleted: true, deletedAt: new Date() },
      });
    } else {
      await prisma.contestHolding.update({
        where: { id: existing.id },
        data: { quantity: remainder, avgPrice: new Prisma.Decimal(existingAvg), isDeleted: false, deletedAt: null },
      });
    }
    return { realizedPnL };
  }

  async getPortfolioSnapshot(contestParticipantId: string) {
    const [participant, positions, holdings] = await Promise.all([
      prisma.contestParticipant.findUnique({ where: { id: contestParticipantId } }),
      prisma.contestPosition.findMany({
        where: { contestParticipantId, isClosed: false, quantity: { not: 0 } },
        include: { instrument: true },
      }),
      prisma.contestHolding.findMany({
        where: { contestParticipantId, isDeleted: false, quantity: { gt: 0 } },
        include: { instrument: true },
      }),
    ]);
    return { participant, positions, holdings };
  }

  /** Cash + mark-to-market value of every open position/holding, using each instrument's cached lastPrice. */
  async computeNav(contestParticipantId: string): Promise<number> {
    const { participant, positions, holdings } = await this.getPortfolioSnapshot(contestParticipantId);
    if (!participant) return 0;

    let mtm = 0;
    for (const p of positions) {
      const ltp = Number(p.instrument.lastPrice ?? p.avgPrice);
      mtm += p.quantity * ltp;
    }
    for (const h of holdings) {
      const ltp = Number(h.instrument.lastPrice ?? h.avgPrice);
      mtm += h.quantity * ltp;
    }
    return Number(participant.cashBalance) + Number(participant.marginUsed) + mtm;
  }
}

export const contestPortfolioService = new ContestPortfolioService();
