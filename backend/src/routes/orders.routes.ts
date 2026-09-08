import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.middleware";
import { orderEngine, AppError } from "../engine/OrderEngine";
import { prisma } from "../utils/prisma";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

const placeOrderSchema = z.object({
  instrumentId: z.string().uuid(),
  transactionType: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["MARKET", "LIMIT", "SL", "SL_M"]),
  productType: z.enum(["INTRADAY", "DELIVERY", "NORMAL"]),
  quantity: z.number().int().positive(),
  price: z.number().positive().optional(),
  triggerPrice: z.number().positive().optional(),
  targetPrice: z.number().positive().optional(),
  stopLossPrice: z.number().positive().optional(),
  // When set, routes this order into that contest's isolated portfolio
  // instead of the user's personal account - see engine/OrderEngine.ts.
  contestId: z.string().uuid().optional(),
});

ordersRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const order = await orderEngine.placeOrder({ userId: req.userId!, ...parsed.data });
    res.status(201).json(order);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

ordersRouter.get("/", async (req: AuthedRequest, res) => {
  const contestId = req.query.contestId as string | undefined;
  const orders = await prisma.order.findMany({
    where: contestId
      ? { userId: req.userId!, contestParticipant: { contestId } }
      : { userId: req.userId!, contestParticipantId: null },
    include: { instrument: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(orders);
});

ordersRouter.delete("/:id", async (req: AuthedRequest, res) => {
  try {
    const order = await orderEngine.cancelOrder(req.userId!, req.params.id);
    res.json(order);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});
