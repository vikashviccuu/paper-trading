import { IKycProvider } from "./IKycProvider";
import { SetuKycProvider } from "./SetuKycProvider";
import { CashfreeKycProvider } from "./CashfreeKycProvider";
import { MockKycProvider } from "./MockKycProvider";
import { env } from "../config/env";

let cached: IKycProvider | null = null;

/** Same idea as brokers/BrokerFactory.ts - swap KYC_PROVIDER in .env, restart, done. */
export function getKycProvider(): IKycProvider {
  if (cached) return cached;

  switch (env.KYC_PROVIDER) {
    case "SETU":
      cached = new SetuKycProvider(env.SETU_CLIENT_ID, env.SETU_CLIENT_SECRET, env.SETU_PRODUCT_INSTANCE_ID, env.NODE_ENV !== "production");
      break;
    case "CASHFREE":
      cached = new CashfreeKycProvider(env.CASHFREE_CLIENT_ID, env.CASHFREE_CLIENT_SECRET, env.NODE_ENV !== "production");
      break;
    case "MOCK":
    default:
      cached = new MockKycProvider();
      break;
  }
  return cached;
}
