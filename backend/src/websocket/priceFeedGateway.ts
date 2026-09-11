import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { getBrokerAdapter } from "../brokers/BrokerFactory";
import { orderEngine } from "../engine/OrderEngine";
import { env } from "../config/env";
import { prisma } from "../utils/prisma";
import { getAccurateBasePrice } from "../utils/marketDataReference";

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

  const subscriberCounts = new Map<string, number>();
  const fallbackIntervals = new Map<string, NodeJS.Timeout>();
  const lastTickTimes = new Map<string, number>();

  io.on("connection", (socket) => {
    const subscribedTokens = new Set<string>();

    socket.on("subscribe", async (tokens: string[]) => {
      const broker = getBrokerAdapter();
      for (const token of tokens) {
        if (subscribedTokens.has(token)) continue;
        subscribedTokens.add(token);
        socket.join(`tick:${token}`);
        const count = subscriberCounts.get(token) ?? 0;
        subscriberCounts.set(token, count + 1);

        if (count === 0) {
          // first subscriber for this token -> open the broker stream
          try {
            await broker.subscribeTicks([token], (quote) => {
              lastTickTimes.set(quote.instrumentToken, Date.now());
              io.to(`tick:${quote.instrumentToken}`).emit("tick", quote);
              orderEngine.evaluatePendingOrders(quote.instrumentToken, quote.lastPrice).catch(() => {});
              prisma.instrument
                .updateMany({ where: { instrumentToken: quote.instrumentToken }, data: { lastPrice: quote.lastPrice } })
                .catch(() => {});
            });
          } catch (subErr: any) {
            console.warn(`[PriceFeed] Broker subscribe failed for token ${token}:`, subErr.message);
          }

          // Fallback heartbeat: If outside market hours or broker is silent,
          // emit simulated ticks every 1.5s using accurate real-market base prices
          if (!fallbackIntervals.has(token)) {
            let lastPrice = 0;
            let currentInst: any = null;
            // query db for initial lastPrice or calculate from accurate reference
            prisma.instrument.findUnique({ where: { instrumentToken: token } }).then((inst) => {
              currentInst = inst;
              const dbPrice = Number(inst?.lastPrice || 0);
              if (dbPrice > 0 && dbPrice !== 1000 && dbPrice !== 1500) {
                lastPrice = dbPrice;
              } else {
                lastPrice = getAccurateBasePrice(inst, token);
              }
            }).catch(() => {
              lastPrice = getAccurateBasePrice(undefined, token);
            });

            const timer = setInterval(() => {
              const lastSeen = lastTickTimes.get(token) ?? 0;
              // If no live tick was received from broker in the last 3.5 seconds
              if (Date.now() - lastSeen > 3500) {
                if (!lastPrice || lastPrice <= 0) {
                  lastPrice = getAccurateBasePrice(currentInst, token);
                }
                const jitter = (Math.random() - 0.495) * 0.0015;
                lastPrice = Number((lastPrice * (1 + jitter)).toFixed(2));

                const quote = {
                  instrumentToken: token,
                  lastPrice,
                  open: Number((lastPrice * 0.998).toFixed(2)),
                  high: Number((lastPrice * 1.002).toFixed(2)),
                  low: Number((lastPrice * 0.997).toFixed(2)),
                  close: Number((lastPrice * 0.999).toFixed(2)),
                  volume: Math.floor(Math.random() * 1000 + 50),
                  timestamp: new Date().toISOString(),
                };

                io.to(`tick:${token}`).emit("tick", quote);
                orderEngine.evaluatePendingOrders(token, lastPrice).catch(() => {});
                prisma.instrument.updateMany({ where: { instrumentToken: token }, data: { lastPrice } }).catch(() => {});
              }
            }, 1500);
            fallbackIntervals.set(token, timer);
          }
        }
      }
    });

    socket.on("unsubscribe", async (tokens: string[]) => {
      const broker = getBrokerAdapter();
      for (const token of tokens) {
        if (!subscribedTokens.has(token)) continue;
        subscribedTokens.delete(token);
        socket.leave(`tick:${token}`);
        const count = (subscriberCounts.get(token) ?? 1) - 1;
        subscriberCounts.set(token, count);
        if (count <= 0) {
          subscriberCounts.delete(token);
          const fallbackTimer = fallbackIntervals.get(token);
          if (fallbackTimer) {
            clearInterval(fallbackTimer);
            fallbackIntervals.delete(token);
          }
          await broker.unsubscribeTicks([token]).catch(() => {});
        }
      }
    });

    socket.on("disconnect", async () => {
      const broker = getBrokerAdapter();
      for (const token of subscribedTokens) {
        const count = (subscriberCounts.get(token) ?? 1) - 1;
        subscriberCounts.set(token, count);
        if (count <= 0) {
          subscriberCounts.delete(token);
          const fallbackTimer = fallbackIntervals.get(token);
          if (fallbackTimer) {
            clearInterval(fallbackTimer);
            fallbackIntervals.delete(token);
          }
          await broker.unsubscribeTicks([token]).catch(() => {});
        }
      }
    });
  });

  return io;
}
