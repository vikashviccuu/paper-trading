import { prisma } from "../utils/prisma";
import { AppError } from "../engine/OrderEngine";

// MOCK is included deliberately - it's the only provider safe to link
// without a real broker account, so the whole eligibility -> link -> enable
// -> 2FA -> place -> audit flow can be exercised end to end in a demo/test
// deployment. See docs/LIVE_TRADING.md.
const SUPPORTED_PROVIDERS = ["ZERODHA", "UPSTOX", "ANGELONE", "ICICIDIRECT", "MOCK"] as const;
export type BrokerProvider = (typeof SUPPORTED_PROVIDERS)[number];

export interface LinkBrokerInput {
  provider: BrokerProvider;
  accessToken: string;
  nickname?: string;
}

/**
 * Per-user broker credential linking - the foundation both a future
 * per-user live-market-data mode and (now) LiveTradingAccount build on. See
 * docs/LIVE_TRADING.md.
 *
 * This is a pragmatic manual-token-paste flow (the user completes each
 * broker's own login/TOTP flow themselves - see docs/BROKER_API_SETUP.md
 * and docs/LIVE_TRADING.md for the exact steps per broker - then pastes the
 * resulting access token here), NOT a full OAuth login-redirect integration.
 * SEBI's Feb 2025 algo-trading circular expects OAuth-based authentication
 * for production API access - a real deployment should replace this with
 * each broker's actual OAuth redirect flow before going live. See
 * docs/LIVE_TRADING.md for the gap this leaves.
 */
export class BrokerLinkService {
  async list(userId: string) {
    return prisma.brokerLink.findMany({
      where: { userId },
      select: { id: true, provider: true, nickname: true, createdAt: true }, // never return accessToken/refreshToken to the client
      orderBy: { createdAt: "asc" },
    });
  }

  async link(userId: string, input: LinkBrokerInput) {
    if (!SUPPORTED_PROVIDERS.includes(input.provider)) {
      throw new AppError(400, `Unsupported broker "${input.provider}" - supported: ${SUPPORTED_PROVIDERS.join(", ")}`);
    }
    if (!input.accessToken.trim()) {
      throw new AppError(400, "Access token is required");
    }

    const link = await prisma.brokerLink.upsert({
      where: { userId_provider: { userId, provider: input.provider } },
      update: { accessToken: input.accessToken, nickname: input.nickname },
      create: { userId, provider: input.provider, accessToken: input.accessToken, nickname: input.nickname },
    });
    return { id: link.id, provider: link.provider, nickname: link.nickname, createdAt: link.createdAt };
  }

  async unlink(userId: string, linkId: string) {
    const link = await prisma.brokerLink.findFirst({ where: { id: linkId, userId } });
    if (!link) throw new AppError(404, "Broker link not found");

    const liveAccount = await prisma.liveTradingAccount.findUnique({ where: { userId } });
    if (liveAccount?.brokerLinkId === linkId && liveAccount.status === "ENABLED") {
      throw new AppError(400, "Disable Live Trading before unlinking the broker it's using");
    }

    await prisma.brokerLink.delete({ where: { id: linkId } });
  }

  /** Internal helper for LiveOrderService/LiveTradingAccountService - never expose accessToken over the API. */
  async getForLiveTrading(userId: string, linkId: string) {
    const link = await prisma.brokerLink.findFirst({ where: { id: linkId, userId } });
    if (!link) throw new AppError(404, "Broker link not found");
    if (!link.accessToken) throw new AppError(400, "This broker link has no access token - relink it");
    return link;
  }
}

export const brokerLinkService = new BrokerLinkService();
