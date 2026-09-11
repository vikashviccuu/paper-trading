import { PrismaClient, Prisma } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { KiteConnect } = require("kiteconnect");
import { prisma } from "../utils/prisma";

const DEFAULT_API_KEY = process.env.KITE_API_KEY || "ouuv4g2r3iyafu5c";

function mapSegment(segment?: string, type?: string): "EQUITY" | "FUTURES" | "OPTIONS" {
  if (type === "CE" || type === "PE") return "OPTIONS";
  if (type === "FUT") return "FUTURES";
  return "EQUITY";
}

function mapOptionType(type?: string): "CE" | "PE" | null {
  if (type === "CE") return "CE";
  if (type === "PE") return "PE";
  return null;
}

export class InstrumentSyncService {
  private static syncing = false;

  /**
   * Syncs instruments from Zerodha Kite Connect public dumps for specified exchanges (default: NSE, NFO, MCX).
   * Does NOT require user login credentials.
   */
  static async syncExchanges(exchanges: string[] = ["NSE", "NFO", "MCX"]): Promise<{ synced: number; totalInDb: number }> {
    if (this.syncing) {
      const count = await prisma.instrument.count();
      return { synced: 0, totalInDb: count };
    }

    this.syncing = true;
    let totalSynced = 0;

    try {
      const kc = new KiteConnect({ api_key: DEFAULT_API_KEY });

      for (const exchange of exchanges) {
        console.log(`[InstrumentSync] Fetching ${exchange} instruments from Zerodha Kite...`);
        try {
          const raw: any[] = await kc.getInstruments(exchange === "ALL" ? undefined : (exchange as any));
          if (!Array.isArray(raw) || raw.length === 0) {
            console.warn(`[InstrumentSync] No instruments returned for ${exchange}`);
            continue;
          }

          const valid = raw.filter((i) => i && i.instrument_token && i.tradingsymbol);
          const BATCH = 1500;
          let exchangeInserted = 0;

          for (let i = 0; i < valid.length; i += BATCH) {
            const batch = valid.slice(i, i + BATCH).map((inst) => ({
              instrumentToken: String(inst.instrument_token),
              tradingSymbol: String(inst.tradingsymbol),
              exchange: String(inst.exchange || exchange),
              segment: mapSegment(inst.segment, inst.instrument_type),
              name: inst.name ? String(inst.name) : null,
              lotSize: Number(inst.lot_size) || 1,
              tickSize: new Prisma.Decimal(inst.tick_size ? String(inst.tick_size) : "0.05"),
              expiry: inst.expiry ? new Date(inst.expiry) : null,
              strike: inst.strike != null ? new Prisma.Decimal(String(inst.strike)) : null,
              optionType: mapOptionType(inst.instrument_type),
              lastPrice: inst.last_price != null ? new Prisma.Decimal(String(inst.last_price)) : null,
            }));

            try {
              const res = await prisma.instrument.createMany({
                data: batch,
                skipDuplicates: true,
              });
              exchangeInserted += res.count;
            } catch (err: any) {
              console.warn(`[InstrumentSync] Batch insert warning for ${exchange}:`, err.message);
            }
          }

          console.log(`[InstrumentSync] ${exchange} complete. Inserted ${exchangeInserted} new instruments (total valid: ${valid.length}).`);
          totalSynced += exchangeInserted;
        } catch (exErr: any) {
          console.error(`[InstrumentSync] Failed to sync ${exchange}:`, exErr.message);
        }
      }

      const totalInDb = await prisma.instrument.count();
      return { synced: totalSynced, totalInDb };
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Run once on server startup if the database is unpopulated or has very few instruments.
   */
  static async autoSyncIfEmpty(): Promise<void> {
    try {
      const count = await prisma.instrument.count();
      if (count < 100) {
        console.log(`[InstrumentSync] Instrument database only has ${count} items. Triggering automatic Zerodha sync...`);
        this.syncExchanges(["NSE", "NFO", "MCX"]).catch((err) =>
          console.error("[InstrumentSync] Background auto-sync failed:", err.message)
        );
      } else {
        console.log(`[InstrumentSync] Instrument database already populated with ${count} instruments.`);
      }
    } catch (err: any) {
      console.warn("[InstrumentSync] autoSyncIfEmpty check failed:", err.message);
    }
  }
}
