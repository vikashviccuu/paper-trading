import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { getBrokerAdapter } from "../brokers/BrokerFactory";
import { orderEngine } from "../engine/OrderEngine";
import { env } from "../config/env";
import { prisma } from "../utils/prisma";

/**
 * Fan-out layer between the (single) broker tick stream and however many
 * browser clients are watching a symbol. Each unique instrumentToken is
 * subscribed to the broker exactly once; every tick is (a) broadcast to
 * subscribed sockets over Socket.io and (b) fed to OrderEngine so resting
 * LIMIT/SL orders can trigger, and (c) cached back onto the Instrument row
 * as lastPrice for REST fallbacks.
 */
export function initPriceFeedGateway(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  const broker = getBrokerAdapter();
  const subscriberCounts = new Map<string, number>();

  io.on("connection", (socket) => {
    const subscribedTokens = new Set<string>();

    socket.on("subscribe", async (tokens: string[]) => {
      for (const token of tokens) {
        if (subscribedTokens.has(token)) continue;
        subscribedTokens.add(token);
        socket.join(`tick:${token}`);
        const count = subscriberCounts.get(token) ?? 0;
        subscriberCounts.set(token, count + 1);

        if (count === 0) {
          // first subscriber for this token -> open the broker stream
          await broker.subscribeTicks([token], (quote) => {
            io.to(`tick:${quote.instrumentToken}`).emit("tick", quote);
            orderEngine.evaluatePendingOrders(quote.instrumentToken, quote.lastPrice).catch(() => {});
            prisma.instrument
              .updateMany({ where: { instrumentToken: quote.instrumentToken }, data: { lastPrice: quote.lastPrice } })
              .catch(() => {});
          });
        }
      }
    });

    socket.on("unsubscribe", async (tokens: string[]) => {
      for (const token of tokens) {
        if (!subscribedTokens.has(token)) continue;
        subscribedTokens.delete(token);
        socket.leave(`tick:${token}`);
        const count = (subscriberCounts.get(token) ?? 1) - 1;
        subscriberCounts.set(token, count);
        if (count <= 0) {
          subscriberCounts.delete(token);
          await broker.unsubscribeTicks([token]);
        }
      }
    });

    socket.on("disconnect", async () => {
      for (const token of subscribedTokens) {
        const count = (subscriberCounts.get(token) ?? 1) - 1;
        subscriberCounts.set(token, count);
        if (count <= 0) {
          subscriberCounts.delete(token);
          await broker.unsubscribeTicks([token]);
        }
      }
    });
  });

  return io;
}
