import { prisma } from "../utils/prisma";
import { Prisma } from "@prisma/client";

/**
 * All wallet / position / holding mutations for the virtual trading engine
 * live here, so OrderEngine stays focused on order lifecycle + margin checks
 * and every balance update goes through one auditable place.
 */
export class PortfolioService {
  async getOrCreateWallet(userId: string, defaultCash: number) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new Error(`Cannot create wallet: User ${userId} does not exist`);
    }
    return prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, cashBalance: new Prisma.Decimal(defaultCash) },
    });
  }

  async blockMargin(userId: string, amount: number) {
    return prisma.wallet.update({
      where: { userId },
      data: {
        cashBalance: { decrement: amount },
        marginUsed: { increment: amount },
      },
    });
  }

  async releaseMargin(userId: string, amount: number) {
    return prisma.wallet.update({
      where: { userId },
      data: {
        cashBalance: { increment: amount },
        marginUsed: { decrement: amount },
      },
    });
  }

  async applyRealizedPnL(userId: string, pnl: number) {
    return prisma.wallet.update({
      where: { userId },
      data: {
        cashBalance: { increment: pnl },
        realizedPnL: { increment: pnl },
      },
    });
  }

  /**
   * Applies a filled order to the user's Position book (MIS/NRML) or
   * Holding book (CNC), netting quantity and re-averaging price the same
   * way a real broker's back office does. Returns realized P&L for any
   * portion that closed/reduced an existing opposite-side position.
   */
  async applyFill(params: {
    userId: string;
    instrumentId: string;
    productType: "INTRADAY" | "DELIVERY" | "NORMAL";
    transactionType: "BUY" | "SELL";
    quantity: number;
    fillPrice: number;
  }): Promise<{ realizedPnL: number }> {
    const { userId, instrumentId, productType, transactionType, quantity, fillPrice } = params;
    const signedQty = transactionType === "BUY" ? quantity : -quantity;

    if (productType === "DELIVERY") {
      return this.applyHoldingFill(userId, instrumentId, signedQty, fillPrice);
    }
    return this.applyPositionFill(userId, instrumentId, productType, signedQty, fillPrice);
  }

  private async applyPositionFill(
    userId: string,
    instrumentId: string,
    productType: "INTRADAY" | "NORMAL",
    signedQty: number,
    fillPrice: number
  ): Promise<{ realizedPnL: number }> {
    const existing = await prisma.position.findUnique({
      where: { userId_instrumentId_productType: { userId, instrumentId, productType } },
    });

    if (!existing) {
      await prisma.position.create({
        data: {
          userId,
          instrumentId,
          productType,
          quantity: signedQty,
          avgPrice: new Prisma.Decimal(fillPrice),
        },
      });
      return { realizedPnL: 0 };
    }

    const existingQty = existing.quantity;
    const existingAvg = Number(existing.avgPrice);
    const sameDirection = Math.sign(existingQty || 1) === Math.sign(signedQty);

    if (sameDirection) {
      // adding to the position -> re-average
      const newQty = existingQty + signedQty;
      const newAvg = (Math.abs(existingQty) * existingAvg + Math.abs(signedQty) * fillPrice) / Math.abs(newQty);
      await prisma.position.update({
        where: { id: existing.id },
        data: { quantity: newQty, avgPrice: new Prisma.Decimal(newAvg) },
      });
      return { realizedPnL: 0 };
    }

    // opposite direction -> this fill closes some/all/more than the open qty
    const closingQty = Math.min(Math.abs(existingQty), Math.abs(signedQty));
    const direction = existingQty > 0 ? 1 : -1; // +1 if we were long, -1 if short
    const realizedPnL = direction * closingQty * (fillPrice - existingAvg);

    const remainder = existingQty + signedQty; // could flip sign if signedQty overshoots
    if (remainder === 0) {
      await prisma.position.delete({ where: { id: existing.id } });
    } else {
      const flipped = Math.sign(remainder) !== Math.sign(existingQty);
      await prisma.position.update({
        where: { id: existing.id },
        data: {
          quantity: remainder,
          avgPrice: new Prisma.Decimal(flipped ? fillPrice : existingAvg),
          realizedPnL: { increment: realizedPnL },
        },
      });
    }
    return { realizedPnL };
  }

  private async applyHoldingFill(
    userId: string,
    instrumentId: string,
    signedQty: number,
    fillPrice: number
  ): Promise<{ realizedPnL: number }> {
    const existing = await prisma.holding.findUnique({
      where: { userId_instrumentId: { userId, instrumentId } },
    });

    if (!existing) {
      await prisma.holding.create({
        data: { userId, instrumentId, quantity: signedQty, avgPrice: new Prisma.Decimal(fillPrice) },
      });
      return { realizedPnL: 0 };
    }

    const existingQty = existing.quantity;
    const existingAvg = Number(existing.avgPrice);

    if (Math.sign(existingQty || 1) === Math.sign(signedQty)) {
      const newQty = existingQty + signedQty;
      const newAvg = (Math.abs(existingQty) * existingAvg + Math.abs(signedQty) * fillPrice) / Math.abs(newQty);
      await prisma.holding.update({
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
      await prisma.holding.delete({ where: { id: existing.id } });
    } else {
      await prisma.holding.update({
        where: { id: existing.id },
        data: { quantity: remainder, avgPrice: new Prisma.Decimal(existingAvg) },
      });
    }
    return { realizedPnL };
  }

  async getPortfolioSnapshot(userId: string) {
    const [wallet, positions, holdings] = await Promise.all([
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.position.findMany({ where: { userId }, include: { instrument: true } }),
      prisma.holding.findMany({ where: { userId }, include: { instrument: true } }),
    ]);
    return { wallet, positions, holdings };
  }
}

export const portfolioService = new PortfolioService();
