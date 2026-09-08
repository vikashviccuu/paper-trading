import { IPayoutProvider } from "./IPayoutProvider";
import { CashfreePayoutProvider } from "./CashfreePayoutProvider";
import { MockPayoutProvider } from "./MockPayoutProvider";
import { env } from "../config/env";

let cached: IPayoutProvider | null = null;

/** Same idea as brokers/BrokerFactory.ts and kyc/KycProviderFactory.ts - swap PAYOUT_PROVIDER in .env, restart, done. */
export function getPayoutProvider(): IPayoutProvider {
  if (cached) return cached;

  switch (env.PAYOUT_PROVIDER) {
    case "CASHFREE":
      cached = new CashfreePayoutProvider(env.CASHFREE_PAYOUT_CLIENT_ID, env.CASHFREE_PAYOUT_CLIENT_SECRET, env.NODE_ENV !== "production");
      break;
    case "MOCK":
    default:
      cached = new MockPayoutProvider();
      break;
  }
  return cached;
}
