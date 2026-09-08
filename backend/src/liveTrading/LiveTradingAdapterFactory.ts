import { ILiveTradingAdapter } from "./ILiveTradingAdapter";
import { MockLiveTradingAdapter } from "./MockLiveTradingAdapter";
import { ZerodhaLiveTradingAdapter } from "./ZerodhaLiveTradingAdapter";
import { UpstoxLiveTradingAdapter } from "./UpstoxLiveTradingAdapter";
import { AngelOneLiveTradingAdapter } from "./AngelOneLiveTradingAdapter";
import { IciciDirectLiveTradingAdapter } from "./IciciDirectLiveTradingAdapter";
import { env } from "../config/env";

const cache = new Map<string, ILiveTradingAdapter>();

/**
 * Unlike BrokerFactory.getBrokerAdapter() (one adapter for the whole app,
 * chosen by a single env var), live trading needs one adapter PER BROKER
 * since different users link different brokers - `provider` here is
 * whatever's stored on that user's BrokerLink.provider row (see
 * LiveOrderService). Each adapter instance still only holds app-level
 * credentials (API key/secret from .env); the per-USER secret (their access
 * token) is passed into every method call, never stored on the adapter -
 * see docs/LIVE_TRADING.md.
 */
export function getLiveTradingAdapter(provider: string): ILiveTradingAdapter {
  const key = provider.toUpperCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let adapter: ILiveTradingAdapter;
  switch (key) {
    case "ZERODHA":
      adapter = new ZerodhaLiveTradingAdapter(env.KITE_API_KEY);
      break;
    case "UPSTOX":
      adapter = new UpstoxLiveTradingAdapter();
      break;
    case "ANGELONE":
      adapter = new AngelOneLiveTradingAdapter(env.ANGEL_API_KEY);
      break;
    case "ICICIDIRECT":
      adapter = new IciciDirectLiveTradingAdapter(env.ICICI_BREEZE_API_KEY, env.ICICI_BREEZE_API_SECRET);
      break;
    case "MOCK":
    default:
      adapter = new MockLiveTradingAdapter();
      break;
  }
  cache.set(key, adapter);
  return adapter;
}
