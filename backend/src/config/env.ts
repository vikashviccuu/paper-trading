import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment-specific file if present (.env.local, .env.uat, .env.production, etc.)
const targetEnv = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
const envFileName = `.env.${targetEnv}`;
const envFilePath = path.resolve(process.cwd(), envFileName);

if (fs.existsSync(envFilePath)) {
  dotenv.config({ path: envFilePath });
}
// Fallback / default .env loading
dotenv.config();

function req(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function getZerodhaDefaultKey(): string {
  if (process.env.KITE_API_KEY) return process.env.KITE_API_KEY;
  if (targetEnv === "uat" || targetEnv === "staging" || targetEnv === "production" || targetEnv === "prod") {
    return "jfwd2gvwal8pq0rp"; // UAT / Production Server API Key
  }
  return "ouuv4g2r3iyafu5c"; // Local Server API Key
}

function getZerodhaDefaultSecret(): string {
  if (process.env.KITE_API_SECRET) return process.env.KITE_API_SECRET;
  if (targetEnv === "uat" || targetEnv === "staging" || targetEnv === "production" || targetEnv === "prod") {
    return "a5j4kdo7zr2u57zfpjan8plmctdjun4t"; // UAT / Production Server API Secret
  }
  return "bebw5v99zjy6nkxc0m2b8d6rbueokrtw"; // Local Server API Secret
}

export function getZerodhaRedirectUrl(requestOrigin?: string): string {
  if (process.env.ZERODHA_REDIRECT_URL) {
    return process.env.ZERODHA_REDIRECT_URL;
  }
  const base = env?.CORS_ORIGIN || requestOrigin || (targetEnv === "uat" || targetEnv === "production" ? "https://187-127-178-25.sslip.io" : "http://localhost:5174");
  return `${base.replace(/\/$/, "")}/admin/zerodha/callback`;
}

export const env = {
  PORT: Number(req("PORT", "4000")),
  NODE_ENV: req("NODE_ENV", "development"),
  APP_ENV: req("APP_ENV", targetEnv),
  JWT_SECRET: req("JWT_SECRET", "dev-secret-change-me"),
  JWT_EXPIRES_IN: req("JWT_EXPIRES_IN", "7d"),
  CORS_ORIGIN: req("CORS_ORIGIN", "http://localhost:5174"),

  // Deliberately a *different* secret from JWT_SECRET so a regular user's
  // token can never be replayed against admin-only routes, or vice versa.
  ADMIN_JWT_SECRET: req("ADMIN_JWT_SECRET", "dev-admin-secret-change-me"),
  ADMIN_JWT_EXPIRES_IN: req("ADMIN_JWT_EXPIRES_IN", "12h"),
  // Used only by `npm run seed:admin` to create the first admin account.
  ADMIN_SEED_EMAIL: req("ADMIN_SEED_EMAIL"),
  ADMIN_SEED_PASSWORD: req("ADMIN_SEED_PASSWORD"),
  ADMIN_SEED_NAME: req("ADMIN_SEED_NAME", "Platform Admin"),

  DATABASE_URL: req("DATABASE_URL", "postgresql://postgres:root@127.0.0.1:5433/paper_trading?schema=public"),
  REDIS_URL: req("REDIS_URL", "redis://localhost:6379"),

  BROKER_PROVIDER: req("BROKER_PROVIDER", "ZERODHA") as "ZERODHA" | "UPSTOX" | "ANGELONE" | "MOCK",

  KITE_API_KEY: req("KITE_API_KEY", getZerodhaDefaultKey()),
  KITE_API_SECRET: req("KITE_API_SECRET", getZerodhaDefaultSecret()),
  KITE_ACCESS_TOKEN: req("KITE_ACCESS_TOKEN"),

  UPSTOX_API_KEY: req("UPSTOX_API_KEY"),
  UPSTOX_API_SECRET: req("UPSTOX_API_SECRET"),
  UPSTOX_REDIRECT_URI: req("UPSTOX_REDIRECT_URI"),
  UPSTOX_ACCESS_TOKEN: req("UPSTOX_ACCESS_TOKEN"),

  ANGEL_API_KEY: req("ANGEL_API_KEY"),
  ANGEL_CLIENT_ID: req("ANGEL_CLIENT_ID"),
  ANGEL_PASSWORD: req("ANGEL_PASSWORD"),
  ANGEL_TOTP_SECRET: req("ANGEL_TOTP_SECRET"),

  DEFAULT_VIRTUAL_CASH: Number(req("DEFAULT_VIRTUAL_CASH", "1000000")),
  INTRADAY_SQUAREOFF_TIME: req("INTRADAY_SQUAREOFF_TIME", "15:20"),
  EQUITY_INTRADAY_MARGIN_PCT: Number(req("EQUITY_INTRADAY_MARGIN_PCT", "0.20")),
  FNO_MARGIN_PCT: Number(req("FNO_MARGIN_PCT", "0.12")),

  // Time-of-day (24h, local server time) treated as "market close" - used
  // both by the personal-account intraday square-off (INTRADAY_SQUAREOFF_TIME
  // above, kept separate since a real broker's MIS cutoff is a few minutes
  // before the actual close) and to pin a contest's computed endDate so a
  // WEEKLY/MONTHLY/etc. contest's last day always ends at market close.
  CONTEST_MARKET_CLOSE_TIME: req("CONTEST_MARKET_CLOSE_TIME", "15:30"),

  // ---- KYC / bank account verification (profile page) ----
  // One of: SETU | CASHFREE | MOCK
  KYC_PROVIDER: req("KYC_PROVIDER", "MOCK") as "SETU" | "CASHFREE" | "MOCK",

  SETU_CLIENT_ID: req("SETU_CLIENT_ID"),
  SETU_CLIENT_SECRET: req("SETU_CLIENT_SECRET"),
  SETU_PRODUCT_INSTANCE_ID: req("SETU_PRODUCT_INSTANCE_ID"),

  CASHFREE_CLIENT_ID: req("CASHFREE_CLIENT_ID"),
  CASHFREE_CLIENT_SECRET: req("CASHFREE_CLIENT_SECRET"),

  // Where uploaded KYC documents (PAN card, Aadhaar, address proof, photo)
  // are written on disk. Swap for an S3/GCS bucket in production - see
  // docs/KYC_AND_BANKING.md#security-notes.
  KYC_UPLOAD_DIR: req("KYC_UPLOAD_DIR", "./uploads/kyc"),
  KYC_MAX_UPLOAD_MB: Number(req("KYC_MAX_UPLOAD_MB", "5")),

  // OTP for phone verification (see OtpService). No SMS gateway is wired up
  // - in non-production the OTP is returned directly in the API response.
  OTP_EXPIRY_MINUTES: Number(req("OTP_EXPIRY_MINUTES", "10")),
  OTP_MAX_ATTEMPTS: Number(req("OTP_MAX_ATTEMPTS", "5")),

  // ---- Contest prize payouts (see docs/PRIZES_AND_PAYOUTS.md) ----
  // Flat TDS rate applied to every contest prize award's gross amount, no
  // minimum threshold - matches Section 194BA (Income Tax Act 1961) / the
  // equivalent Section 393(3) (Income Tax Act 2025, effective 1 Apr 2026)
  // "net winnings from online games" rule as of Aug 2026. Configurable only
  // because tax law can change; do not lower this without legal sign-off.
  TDS_RATE_PCT: Number(req("TDS_RATE_PCT", "30")),

  // One of: CASHFREE | MOCK
  PAYOUT_PROVIDER: req("PAYOUT_PROVIDER", "MOCK") as "CASHFREE" | "MOCK",

  // Cashfree Payouts uses its own API credentials, separate from the
  // Verification Suite credentials above (CASHFREE_CLIENT_ID/SECRET) even
  // though both are Cashfree products.
  CASHFREE_PAYOUT_CLIENT_ID: req("CASHFREE_PAYOUT_CLIENT_ID"),
  CASHFREE_PAYOUT_CLIENT_SECRET: req("CASHFREE_PAYOUT_CLIENT_SECRET"),

  // ---- Live (real-money) trading (see docs/LIVE_TRADING.md) ----
  // Master kill switch for the whole feature - defaults OFF. Even with a
  // LiveTradingAccount in ENABLED status, every live order route 400s if
  // this is false. Deliberately opt-in at the deployment level, not just
  // the per-user level, given the regulatory stakes.
  LIVE_TRADING_ENABLED: req("LIVE_TRADING_ENABLED", "false") === "true",

  // SELF_CUSTODY (default, implemented): every live order executes on the
  // user's own linked broker account via their own credentials - the
  // platform never custodies real client money. PLATFORM_POOLED is NOT
  // implemented in this codebase - selecting it makes every live order
  // route fail closed with an explanatory error. See
  // docs/LIVE_TRADING.md#execution-model for why (it would make the
  // platform a de facto broker/intermediary requiring SEBI registration).
  LIVE_EXECUTION_MODE: req("LIVE_EXECUTION_MODE", "SELF_CUSTODY") as "SELF_CUSTODY" | "PLATFORM_POOLED",

  // ---- ICICI Direct (Breeze Connect) - live order placement only, not used for market data ----
  ICICI_BREEZE_API_KEY: req("ICICI_BREEZE_API_KEY"),
  ICICI_BREEZE_API_SECRET: req("ICICI_BREEZE_API_SECRET"),

  // Basic default risk-control caps applied to every new LiveTradingAccount
  // (a user can only tighten these from their setup page, never loosen past
  // an admin-set ceiling - see LiveTradingAccountService).
  LIVE_DEFAULT_DAILY_ORDER_LIMIT: Number(req("LIVE_DEFAULT_DAILY_ORDER_LIMIT", "50")),
  LIVE_DEFAULT_MAX_ORDER_VALUE: Number(req("LIVE_DEFAULT_MAX_ORDER_VALUE", "50000")),
  LIVE_ORDER_2FA_VALIDITY_MINUTES: Number(req("LIVE_ORDER_2FA_VALIDITY_MINUTES", "5")),

  // ---- MSG91 OTP Gateway ----
  MSG91_AUTHKEY: req("MSG91_AUTHKEY", "570228A73XWp3T6aa432acP1"),
  MSG91_TOKEN: req("MSG91_TOKEN", "570228TxAclE2n6aa42b5dP1"),
  MSG91_WIDGET_ID: req("MSG91_WIDGET_ID", "SecureOTPWidget2KQL"),
  MSG91_TEMPLATE_ID: req("MSG91_TEMPLATE_ID", "SecureOTPWidget2KQL"),
};

