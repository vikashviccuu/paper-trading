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
 * Ensures multi-subscriber resilience so modals and symbols never stop ticking.
 */
export function initPriceFeedGateway(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  const subscriberCounts = new Map<string, number>();
  const lastTickTimes = new Map<string, number>();
  const latestQuoteCache = new Map<string, any>();
  const tokenMetadata = new Map<string, { lastPrice: number; exchange: string; tradingSymbol: string; inst?: any }>();

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

  // Global heartbeat ticker: runs once per second across all active tokens
  const globalHeartbeat = setInterval(() => {
    if (subscriberCounts.size === 0) return;
    const now = Date.now();

    for (const [token, count] of subscriberCounts.entries()) {
      if (count <= 0) continue;
      const lastSeen = lastTickTimes.get(token) ?? 0;

      // If no broker tick was received in the last 1.5 seconds, emit heartbeat
      if (now - lastSeen > 1500) {
        const meta = tokenMetadata.get(token);
        let lastPrice = meta?.lastPrice ?? latestQuoteCache.get(token)?.lastPrice ?? 0;

        if (!lastPrice || lastPrice <= 0) {
          lastPrice = getAccurateBasePrice(meta?.inst, token);
        }

        const exchange = meta?.exchange || "NSE";
        const marketStatus = isMarketOpen(exchange);

        if (marketStatus.isOpen) {
          const jitter = (Math.random() - 0.495) * 0.0006;
          const newPrice = Number((lastPrice * (1 + jitter)).toFixed(2));
          if (newPrice > 0) {
            lastPrice = Math.round(newPrice * 20) / 20;
          }
        }

        if (meta) meta.lastPrice = lastPrice;

        const quote = createQuote(token, lastPrice, meta?.inst);
        latestQuoteCache.set(token, quote);
        io.to(`tick:${token}`).emit("tick", quote);
      }
    }
  }, 1000);

  io.on("connection", (socket) => {
    const subscribedTokens = new Set<string>();

    socket.on("subscribe", async (tokens: string[]) => {
      if (!Array.isArray(tokens) || tokens.length === 0) return;
      const broker = getBrokerAdapter();

      for (const token of tokens) {
        if (!token) continue;

        // Send cached quote immediately if available
        const cached = latestQuoteCache.get(token);
        if (cached) {
          socket.emit("tick", cached);
        } else {
          // Look up instrument from database once and cache
          prisma.instrument.findUnique({ where: { instrumentToken: token } }).then((inst) => {
            const dbPrice = Number(inst?.lastPrice || 0);
            const basePrice = dbPrice > 0 && dbPrice !== 1000 && dbPrice !== 1500 && dbPrice !== 450
              ? dbPrice
              : getAccurateBasePrice(inst, token);
            tokenMetadata.set(token, {
              lastPrice: basePrice,
              exchange: inst?.exchange || "NSE",
              tradingSymbol: inst?.tradingSymbol || token,
              inst,
            });
            const instantQuote = createQuote(token, basePrice, inst);
            latestQuoteCache.set(token, instantQuote);
            socket.emit("tick", instantQuote);
          }).catch(() => {
            const basePrice = getAccurateBasePrice(undefined, token);
            tokenMetadata.set(token, {
              lastPrice: basePrice,
              exchange: "NSE",
              tradingSymbol: token,
            });
            const instantQuote = createQuote(token, basePrice);
            latestQuoteCache.set(token, instantQuote);
            socket.emit("tick", instantQuote);
          });
        }

        if (subscribedTokens.has(token)) continue;
        subscribedTokens.add(token);
        socket.join(`tick:${token}`);
        const count = subscriberCounts.get(token) ?? 0;
        subscriberCounts.set(token, count + 1);

        if (count === 0) {
          try {
            await broker.subscribeTicks([token], (quote) => {
              const fullQuote = {
                ...quote,
                close: quote.close ?? quote.closePrice ?? quote.lastPrice,
                closePrice: quote.closePrice ?? quote.close ?? quote.lastPrice,
              };
              lastTickTimes.set(quote.instrumentToken, Date.now());
              latestQuoteCache.set(quote.instrumentToken, fullQuote);
              const meta = tokenMetadata.get(quote.instrumentToken);
              if (meta) meta.lastPrice = quote.lastPrice;
              io.to(`tick:${quote.instrumentToken}`).emit("tick", fullQuote);
              orderEngine.evaluatePendingOrders(quote.instrumentToken, quote.lastPrice).catch(() => { });
            });
          } catch (subErr: any) {
            console.warn(`[PriceFeed] Broker subscribe failed for token ${token}:`, subErr.message);
          }
        }
      }
    });

    socket.on("unsubscribe", async (tokens: string[]) => {
      if (!Array.isArray(tokens) || tokens.length === 0) return;
      const broker = getBrokerAdapter();
      for (const token of tokens) {
        if (!subscribedTokens.has(token)) continue;
        subscribedTokens.delete(token);
        socket.leave(`tick:${token}`);
        const currentCount = subscriberCounts.get(token) ?? 1;
        const newCount = Math.max(0, currentCount - 1);
        if (newCount === 0) {
          subscriberCounts.delete(token);
          await broker.unsubscribeTicks([token]).catch(() => { });
        } else {
          subscriberCounts.set(token, newCount);
        }
      }
    });

    socket.on("disconnect", async () => {
      const broker = getBrokerAdapter();
      for (const token of subscribedTokens) {
        const currentCount = subscriberCounts.get(token) ?? 1;
        const newCount = Math.max(0, currentCount - 1);
        if (newCount === 0) {
          subscriberCounts.delete(token);
          await broker.unsubscribeTicks([token]).catch(() => { });
        } else {
          subscriberCounts.set(token, newCount);
        }
      }
      subscribedTokens.clear();
    });
  });

  return io;
}
