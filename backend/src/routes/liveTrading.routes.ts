import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.middleware";
import { brokerLinkService } from "../services/BrokerLinkService";
import { liveTradingAccountService } from "../services/LiveTradingAccountService";
import { liveOrderService } from "../services/LiveOrderService";
import { AppError } from "../engine/OrderEngine";
import { env } from "../config/env";

/**
 * Real-money trading - see docs/LIVE_TRADING.md before touching anything
 * here. Every route in this file is meaningfully different in risk profile
 * from the rest of the app: it can move a user's real money through a real
 * broker. `LIVE_TRADING_ENABLED` (checked inside LiveOrderService, and again
 * here for the setup routes) is the deployment-level kill switch.
 */
export const liveTradingRouter = Router();
liveTradingRouter.use(requireAuth);

function wrap(fn: (req: AuthedRequest, res: any) => Promise<void>) {
  return async (req: AuthedRequest, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
      throw err;
    }
  };
}

liveTradingRouter.get(
  "/account",
  wrap(async (req, res) => {
    const account = await liveTradingAccountService.getOrCreate(req.userId!);
    res.json({ ...account, liveTradingEnabledOnDeployment: env.LIVE_TRADING_ENABLED });
  })
);

liveTradingRouter.get(
  "/brokers",
  wrap(async (req, res) => {
    res.json(await brokerLinkService.list(req.userId!));
  })
);

const linkBrokerSchema = z.object({
  provider: z.enum(["ZERODHA", "UPSTOX", "ANGELONE", "ICICIDIRECT", "MOCK"]),
  accessToken: z.string().min(1),
  nickname: z.string().optional(),
});

liveTradingRouter.post(
  "/brokers",
  wrap(async (req, res) => {
    const parsed = linkBrokerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.status(201).json(await brokerLinkService.link(req.userId!, parsed.data));
  })
);

liveTradingRouter.delete(
  "/brokers/:id",
  wrap(async (req, res) => {
    await brokerLinkService.unlink(req.userId!, req.params.id);
    res.status(204).end();
  })
);

const enableSchema = z.object({ brokerLinkId: z.string().min(1) });

liveTradingRouter.post(
  "/enable",
  wrap(async (req, res) => {
    const parsed = enableSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(await liveTradingAccountService.linkBrokerAndEnable(req.userId!, parsed.data.brokerLinkId));
  })
);

liveTradingRouter.post(
  "/disable",
  wrap(async (req, res) => {
    res.json(await liveTradingAccountService.disable(req.userId!));
  })
);

const killSwitchSchema = z.object({ active: z.boolean() });

liveTradingRouter.post(
  "/kill-switch",
  wrap(async (req, res) => {
    const parsed = killSwitchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(await liveTradingAccountService.setKillSwitch(req.userId!, parsed.data.active));
  })
);

const riskLimitsSchema = z.object({ dailyOrderLimit: z.number().int().positive(), maxOrderValue: z.number().positive() });

liveTradingRouter.patch(
  "/risk-limits",
  wrap(async (req, res) => {
    const parsed = riskLimitsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(await liveTradingAccountService.updateRiskLimits(req.userId!, parsed.data.dailyOrderLimit, parsed.data.maxOrderValue));
  })
);

const sendOtpSchema = z.object({ phone: z.string().regex(/^[6-9][0-9]{9}$/, "Enter a valid 10-digit Indian mobile number") });

liveTradingRouter.post(
  "/orders/confirm-otp/send",
  wrap(async (req, res) => {
    const parsed = sendOtpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { otp, expiresAt } = await liveOrderService.sendOrderConfirmationOtp(req.userId!, parsed.data.phone);
    res.json({ sent: true, expiresAt, otp }); // otp present only outside production - see OtpService
  })
);

const verifyOtpSchema = z.object({ phone: z.string().regex(/^[6-9][0-9]{9}$/), otp: z.string().length(6) });

liveTradingRouter.post(
  "/orders/confirm-otp/verify",
  wrap(async (req, res) => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    await liveOrderService.verifyOrderConfirmationOtp(req.userId!, parsed.data.phone, parsed.data.otp);
    res.json({ verified: true });
  })
);

const placeOrderSchema = z.object({
  tradingSymbol: z.string().min(1),
  exchange: z.string().min(1),
  instrumentToken: z.string().optional(),
  transactionType: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["MARKET", "LIMIT", "SL", "SL_M"]),
  productType: z.enum(["INTRADAY", "DELIVERY", "NORMAL"]),
  quantity: z.number().int().positive(),
  price: z.number().positive().optional(),
  triggerPrice: z.number().positive().optional(),
  twoFactorPhone: z.string().regex(/^[6-9][0-9]{9}$/),
});

liveTradingRouter.post(
  "/orders",
  wrap(async (req, res) => {
    const parsed = placeOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const order = await liveOrderService.placeOrder(req.userId!, parsed.data);
    res.status(201).json(order);
  })
);

liveTradingRouter.get(
  "/orders",
  wrap(async (req, res) => {
    res.json(await liveOrderService.listOrders(req.userId!));
  })
);

liveTradingRouter.post(
  "/orders/:id/cancel",
  wrap(async (req, res) => {
    res.json(await liveOrderService.cancelOrder(req.userId!, req.params.id));
  })
);

liveTradingRouter.post(
  "/orders/:id/sync",
  wrap(async (req, res) => {
    res.json(await liveOrderService.syncOrderStatus(req.userId!, req.params.id));
  })
);

liveTradingRouter.get(
  "/positions",
  wrap(async (req, res) => {
    res.json(await liveOrderService.getPositions(req.userId!));
  })
);

liveTradingRouter.get(
  "/holdings",
  wrap(async (req, res) => {
    res.json(await liveOrderService.getHoldings(req.userId!));
  })
);
