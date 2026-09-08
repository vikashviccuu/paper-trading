import { prisma } from "../utils/prisma";
import { Prisma } from "@prisma/client";
import { getBrokerAdapter } from "../brokers/BrokerFactory";
import { calculateRequiredMargin } from "./MarginCalculator";
import { portfolioService } from "./PortfolioService";
import { contestPortfolioService } from "./ContestPortfolioService";
import { env } from "../config/env";

export interface PlaceOrderInput {
  userId: string;
  instrumentId: string;
  transactionType: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL_M";
  productType: "INTRADAY" | "DELIVERY" | "NORMAL";
  quantity: number;
  price?: number; // required for LIMIT / SL
  triggerPrice?: number; // required for SL / SL_M
  targetPrice?: number;
  stopLossPrice?: number;
  /**
   * If set, this order is placed inside a contest entry rather than the
   * user's personal paper trading account - it debits/credits that
   * ContestParticipant's isolated wallet and nets into ContestPosition /
   * ContestHolding instead of the personal Wallet / Position / Holding.
   * The caller passes a contestId (not a contestParticipantId); this
   * resolves the user's own participant row for that contest.
   */
  contestId?: string;
}

/**
 * Virtual order matching engine. MARKET orders fill immediately against the
 * broker adapter's current LTP. LIMIT / SL / SL-M orders are persisted as
 * OPEN and resolved later by `evaluatePendingOrders`, which the WebSocket
 * price gateway calls on every incoming tick (see websocket/priceFeedGateway.ts)
 * - this mimics how a real exchange order book triggers resting orders off
 * the live tape, just without a matching counterparty (the "counterparty" is
 * always the simulator itself).
 *
 * Every order belongs to exactly one ledger: the user's personal account, or
 * one contest entry (see PlaceOrderInput.contestId / docs/CONTESTS.md). The
 * two ledgers are never mixed.
 */
export class OrderEngine {
  async placeOrder(input: PlaceOrderInput) {
    const instrument = await prisma.instrument.findUnique({ where: { id: input.instrumentId } });
    if (!instrument) throw new AppError(404, "Instrument not found");

    if ((input.orderType === "LIMIT" || input.orderType === "SL") && input.price == null) {
      throw new AppError(400, "price is required for LIMIT/SL orders");
    }
    if ((input.orderType === "SL" || input.orderType === "SL_M") && input.triggerPrice == null) {
      throw new AppError(400, "triggerPrice is required for SL/SL-M orders");
    }

    let contestParticipantId: string | undefined;
    if (input.contestId) {
      const contest = await prisma.contest.findUnique({ where: { id: input.contestId } });
      if (!contest) throw new AppError(404, "Contest not found");
      const now = new Date();
      if (contest.status !== "ACTIVE" || now < contest.startDate || now > contest.endDate) {
        throw new AppError(400, "Contest is not currently accepting trades");
      }
      const participant = await prisma.contestParticipant.findUnique({
        where: { contestId_userId: { contestId: input.contestId, userId: input.userId } },
      });
      if (!participant) throw new AppError(403, "Join this contest before placing orders in it");
      contestParticipantId = participant.id;
    } else {
      await portfolioService.getOrCreateWallet(input.userId, env.DEFAULT_VIRTUAL_CASH);
    }

    const order = await prisma.order.create({
      data: {
        userId: input.userId,
        contestParticipantId,
        instrumentId: input.instrumentId,
        transactionType: input.transactionType,
        orderType: input.orderType,
        productType: input.productType,
        quantity: input.quantity,
        price: input.price != null ? new Prisma.Decimal(input.price) : null,
        triggerPrice: input.triggerPrice != null ? new Prisma.Decimal(input.triggerPrice) : null,
        targetPrice: input.targetPrice != null ? new Prisma.Decimal(input.targetPrice) : null,
        stopLossPrice: input.stopLossPrice != null ? new Prisma.Decimal(input.stopLossPrice) : null,
        status: "PENDING",
      },
    });

    if (input.orderType === "MARKET") {
      const [quote] = await getBrokerAdapter().getQuote([instrument.instrumentToken]);
      const fillPrice = quote?.lastPrice ?? Number(instrument.lastPrice ?? 0);
      return this.fillOrder(order.id, fillPrice);
    }

    // LIMIT / SL / SL-M sit open until a tick crosses them.
    return prisma.order.update({ where: { id: order.id }, data: { status: "OPEN" } });
  }

  /** Called by the tick gateway for every OPEN order on a symbol that just ticked. */
  async evaluatePendingOrders(instrumentToken: string, ltp: number) {
    const instrument = await prisma.instrument.findUnique({ where: { instrumentToken } });
    if (!instrument) return;

    const openOrders = await prisma.order.findMany({
      where: { instrumentId: instrument.id, status: "OPEN" },
    });

    for (const order of openOrders) {
      const shouldFill = this.checkTrigger(order, ltp);
      if (shouldFill) {
        const fillPrice = order.orderType === "LIMIT" ? Number(order.price) : ltp;
        await this.fillOrder(order.id, fillPrice).catch(() => {
          /* insufficient margin etc. - leave order OPEN, will retry on next tick */
        });
      }
    }
  }

  private checkTrigger(order: { orderType: string; transactionType: string; price: any; triggerPrice: any }, ltp: number): boolean {
    if (order.orderType === "LIMIT") {
      const limit = Number(order.price);
      return order.transactionType === "BUY" ? ltp <= limit : ltp >= limit;
    }
    if (order.orderType === "SL" || order.orderType === "SL_M") {
      const trigger = Number(order.triggerPrice);
      return order.transactionType === "BUY" ? ltp >= trigger : ltp <= trigger;
    }
    return false;
  }

  private async fillOrder(orderId: string, fillPrice: number) {
    return prisma
      .$transaction(async (tx) => {
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { instrument: true } });

        const requiredMargin = calculateRequiredMargin({
          instrument: order.instrument,
          productType: order.productType,
          quantity: order.quantity,
          price: fillPrice,
        });

        const isContestOrder = !!order.contestParticipantId;
        const availableCash = isContestOrder
          ? Number((await tx.contestParticipant.findUniqueOrThrow({ where: { id: order.contestParticipantId! } })).cashBalance)
          : Number((await tx.wallet.findUniqueOrThrow({ where: { userId: order.userId } })).cashBalance);

        if (availableCash < requiredMargin) {
          await tx.order.update({
            where: { id: orderId },
            data: { status: "REJECTED", rejectionReason: "Insufficient virtual margin" },
          });
          throw new AppError(400, "Insufficient virtual margin");
        }

        // BUY blocks margin; SELL (closing a long / opening a short) releases
        // margin proportionally - simplified here as: BUY always blocks,
        // SELL always releases the same formula amount. Good enough for a
        // paper trading simulator's purposes.
        if (isContestOrder) {
          if (order.transactionType === "BUY") {
            await tx.contestParticipant.update({
              where: { id: order.contestParticipantId! },
              data: { cashBalance: { decrement: requiredMargin }, marginUsed: { increment: requiredMargin } },
            });
          } else {
            await tx.contestParticipant.update({
              where: { id: order.contestParticipantId! },
              data: { cashBalance: { increment: requiredMargin }, marginUsed: { decrement: requiredMargin } },
            });
          }
        } else {
          if (order.transactionType === "BUY") {
            await tx.wallet.update({
              where: { userId: order.userId },
              data: { cashBalance: { decrement: requiredMargin }, marginUsed: { increment: requiredMargin } },
            });
          } else {
            await tx.wallet.update({
              where: { userId: order.userId },
              data: { cashBalance: { increment: requiredMargin }, marginUsed: { decrement: requiredMargin } },
            });
          }
        }

        await tx.order.update({
          where: { id: orderId },
          data: { status: "COMPLETE", filledPrice: new Prisma.Decimal(fillPrice) },
        });

        return order;
      })
      .then(async (order) => {
        if (order.contestParticipantId) {
          const { realizedPnL } = await contestPortfolioService.applyFill({
            contestParticipantId: order.contestParticipantId,
            instrumentId: order.instrumentId,
            productType: order.productType as any,
            transactionType: order.transactionType as any,
            quantity: order.quantity,
            fillPrice,
          });
          if (realizedPnL !== 0) {
            await contestPortfolioService.applyRealizedPnL(order.contestParticipantId, realizedPnL);
          }
        } else {
          const { realizedPnL } = await portfolioService.applyFill({
            userId: order.userId,
            instrumentId: order.instrumentId,
            productType: order.productType as any,
            transactionType: order.transactionType as any,
            quantity: order.quantity,
            fillPrice,
          });
          if (realizedPnL !== 0) {
            await portfolioService.applyRealizedPnL(order.userId, realizedPnL);
          }
        }
        return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      });
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, userId } });
    if (order.status !== "OPEN" && order.status !== "PENDING") {
      throw new AppError(400, `Cannot cancel an order in status ${order.status}`);
    }
    return prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  }
}

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export const orderEngine = new OrderEngine();
