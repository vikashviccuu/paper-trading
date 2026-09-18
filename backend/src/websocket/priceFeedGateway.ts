import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { getBrokerAdapter } from "../brokers/BrokerFactory";
import { orderEngine } from "../engine/OrderEngine";
import { env } from "../config/env";
import { prisma } from "../utils/prisma";
import { getAccurateBasePrice, getAccuratePrevClose } from "../utils/marketDataReference";
import { isMarketOpen } from "../utils/marketHours";

/**
 * Fan-out layer between the broker tick stream and browser clients.
 * Caches latest ticks and provides instant emission upon subscription.
 * When market is closed, prices remain rock-solid and do not fluctuate.
 */
export function initPriceFeedGateway(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  const subscriberCounts = new Map<string, number>();
  const fallbackIntervals = new Map<string, NodeJS.Timeout>();
  const lastTickTimes = new Map<string, number>();
  const latestQuoteCache = new Map<string, any>();

  function createQuote(token: string, price: number, inst?: any) {
    const prevClose = getAccuratePrevClose(inst, token);
    const netChange = Number((price - prevClose).toFixed(2));
    const changePercent = prevClose > 0 ? Number(((netChange / prevClose) * 100).toFixed(2)) : 0;
    const open = Number((prevClose * 1.0008).toFixed(2));
    const high = Number((Math.max(price, open) * 1.002).toFixed(2));
    const low = Number((Math.min(price, open) * 0.998).toFixed(2));

    return {
      instrumentToken: token,
      tradingSymbol: inst?.tradingSymbol || token,
      lastPrice: price,
      closePrice: prevClose,
      close: prevClose,
      open,
      high,
      low,
      volume: 450000 + Math.floor(Math.random() * 50000),
      netChange,
      changePercent,
      timestamp: new Date().toISOString(),
    };
  }

  io.on("connection", (socket) => {
    const subscribedTokens = new Set<string>();

    socket.on("subscribe", async (tokens: string[]) => {
      const broker = getBrokerAdapter();
      for (const token of tokens) {
        // Send cached quote immediately if available
        const cached = latestQuoteCache.get(token);
        if (cached) {
          socket.emit("tick", cached);
        } else {
          // Attempt to query real quote from broker first (e.g. Zerodha)
          broker.getQuote([token]).then((quotes) => {
            if (quotes && quotes.length > 0 && quotes[0].lastPrice > 0) {
              const q = quotes[0];
              const fullQuote = {
                ...q,
                close: q.close ?? q.closePrice ?? q.lastPrice,
                closePrice: q.closePrice ?? q.close ?? q.lastPrice,
              };
              latestQuoteCache.set(token, fullQuote);
              socket.emit("tick", fullQuote);
              return;
            }
            throw new Error("No broker quote");
          }).catch(() => {
            // Look up instrument from database for accurate symbol and price
            prisma.instrument.findUnique({ where: { instrumentToken: token } }).then((inst) => {
              const dbPrice = Number(inst?.lastPrice || 0);
              const basePrice = dbPrice > 0 && dbPrice !== 1000 && dbPrice !== 1500
                ? dbPrice
                : getAccurateBasePrice(inst, token);
              const instantQuote = createQuote(token, basePrice, inst);
              latestQuoteCache.set(token, instantQuote);
              socket.emit("tick", instantQuote);
            }).catch(() => {
              const basePrice = getAccurateBasePrice(undefined, token);
              const instantQuote = createQuote(token, basePrice);
              latestQuoteCache.set(token, instantQuote);
              socket.emit("tick", instantQuote);
            });
          });
        }

        if (subscribedTokens.has(token)) continue;
        subscribedTokens.add(token);
        socket.join(`tick:${token}`);
        const count = subscriberCounts.get(token) ?? 0;
        subscriberCounts.set(token, count + 1);

        if (count === 0) {
          // First subscriber for this token -> open the broker stream
          try {
            await broker.subscribeTicks([token], (quote) => {
              const fullQuote = {
                ...quote,
                close: quote.close ?? quote.closePrice ?? quote.lastPrice,
                closePrice: quote.closePrice ?? quote.close ?? quote.lastPrice,
              };
              lastTickTimes.set(quote.instrumentToken, Date.now());
              latestQuoteCache.set(quote.instrumentToken, fullQuote);
              io.to(`tick:${quote.instrumentToken}`).emit("tick", fullQuote);
              orderEngine.evaluatePendingOrders(quote.instrumentToken, quote.lastPrice).catch(() => { });
              prisma.instrument
                .updateMany({ where: { instrumentToken: quote.instrumentToken }, data: { lastPrice: quote.lastPrice } })
                .catch(() => { });
            });
          } catch (subErr: any) {
            console.warn(`[PriceFeed] Broker subscribe failed for token ${token}:`, subErr.message);
          }

          // Fallback heartbeat: Only for simulated/mock feeds.
          // Real brokers (ZERODHA) rely on real ticks and Kite quotes.
          if (!fallbackIntervals.has(token) && broker.providerName !== "ZERODHA") {
            let lastPrice = 0;
            let currentInst: any = null;
            prisma.instrument.findUnique({ where: { instrumentToken: token } }).then((inst) => {
              currentInst = inst;
              const dbPrice = Number(inst?.lastPrice || 0);
              if (dbPrice > 0 && dbPrice !== 1000 && dbPrice !== 1500) {
                lastPrice = dbPrice;
              } else {
                lastPrice = getAccurateBasePrice(inst, token);
              }
              const initialQuote = createQuote(token, lastPrice, currentInst);
              latestQuoteCache.set(token, initialQuote);
            }).catch(() => {
              lastPrice = getAccurateBasePrice(undefined, token);
              const initialQuote = createQuote(token, lastPrice);
              latestQuoteCache.set(token, initialQuote);
            });

            const timer = setInterval(() => {
              if (broker.providerName === "ZERODHA") return;
              const lastSeen = lastTickTimes.get(token) ?? 0;
              // If no live tick was received from broker in the last 3.5 seconds
              if (Date.now() - lastSeen > 3500) {
                if (!lastPrice || lastPrice <= 0) {
                  lastPrice = getAccurateBasePrice(currentInst, token);
                }

                const marketStatus = isMarketOpen(currentInst?.exchange || "NSE");

                // If market is OPEN: apply subtle micro-jitter within standard bounds.
                // If market is CLOSED: DO NOT jitter! Keep price rock solid at steady level.
                if (marketStatus.isOpen) {
                  const jitter = (Math.random() - 0.495) * 0.0004;
                  lastPrice = Number((lastPrice * (1 + jitter)).toFixed(2));
                }

                const quote = createQuote(token, lastPrice, currentInst);
                latestQuoteCache.set(token, quote);

                io.to(`tick:${token}`).emit("tick", quote);
                if (marketStatus.isOpen) {
                  orderEngine.evaluatePendingOrders(token, lastPrice).catch(() => { });
                  prisma.instrument.updateMany({ where: { instrumentToken: token }, data: { lastPrice } }).catch(() => { });
                }
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
          await broker.unsubscribeTicks([token]).catch(() => { });
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
          await broker.unsubscribeTicks([token]).catch(() => { });
        }
      }
    });
  });

  return io;
}
