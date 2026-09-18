import { IBrokerAdapter } from "./IBrokerAdapter";
import { ZerodhaAdapter } from "./zerodha/ZerodhaAdapter";
import { UpstoxAdapter } from "./upstox/UpstoxAdapter";
import { AngelOneAdapter } from "./angelone/AngelOneAdapter";
import { MockAdapter } from "./mock/MockAdapter";
import { env } from "../config/env";

let cachedAdapter: IBrokerAdapter | null = null;

export function resetBrokerAdapter(): void {
  cachedAdapter = null;
}

/**
 * Returns the active broker adapter, chosen by BROKER_PROVIDER in .env.
 * The rest of the app (routes, engine, websocket gateway) should always
 * fetch the adapter through this factory rather than importing a concrete
 * adapter class directly - that's what makes "use all available broker
 * APIs" possible: swap the .env value, restart, done.
 */
export function getBrokerAdapter(): IBrokerAdapter {
  if (cachedAdapter) return cachedAdapter;

  const kiteToken = process.env.KITE_ACCESS_TOKEN || (env as any).KITE_ACCESS_TOKEN;
  const activeProvider = (env.BROKER_PROVIDER === "MOCK" && !kiteToken)
    ? "MOCK"
    : (kiteToken || env.BROKER_PROVIDER === "ZERODHA" ? "ZERODHA" : (env.BROKER_PROVIDER || "ZERODHA"));

  switch (activeProvider) {
    case "ZERODHA":
      cachedAdapter = new ZerodhaAdapter(env.KITE_API_KEY, env.KITE_API_SECRET, kiteToken);
      break;
    case "UPSTOX":
      cachedAdapter = new UpstoxAdapter(
        env.UPSTOX_API_KEY,
        env.UPSTOX_API_SECRET,
        env.UPSTOX_REDIRECT_URI,
        env.UPSTOX_ACCESS_TOKEN
      );
      break;
    case "ANGELONE":
      cachedAdapter = new AngelOneAdapter(
        env.ANGEL_API_KEY,
        env.ANGEL_CLIENT_ID,
        env.ANGEL_PASSWORD,
        env.ANGEL_TOTP_SECRET
      );
      break;
    case "MOCK":
    default:
      cachedAdapter = new MockAdapter();
      break;
  }
  return cachedAdapter;
}

/** For tests / multi-broker features that need a specific provider on demand. */
export function createBrokerAdapter(provider: string): IBrokerAdapter {
  switch (provider) {
    case "ZERODHA":
      return new ZerodhaAdapter(env.KITE_API_KEY, env.KITE_API_SECRET, env.KITE_ACCESS_TOKEN);
    case "UPSTOX":
      return new UpstoxAdapter(env.UPSTOX_API_KEY, env.UPSTOX_API_SECRET, env.UPSTOX_REDIRECT_URI, env.UPSTOX_ACCESS_TOKEN);
    case "ANGELONE":
      return new AngelOneAdapter(env.ANGEL_API_KEY, env.ANGEL_CLIENT_ID, env.ANGEL_PASSWORD, env.ANGEL_TOTP_SECRET);
    default:
      return new MockAdapter();
  }
}
