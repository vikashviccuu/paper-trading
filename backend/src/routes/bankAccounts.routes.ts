import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.middleware";
import { bankAccountService } from "../services/BankAccountService";
import { AppError } from "../engine/OrderEngine";

export const bankAccountsRouter = Router();
bankAccountsRouter.use(requireAuth);

bankAccountsRouter.get("/", async (req: AuthedRequest, res) => {
  res.json(await bankAccountService.list(req.userId!));
});

const addSchema = z.object({
  accountHolderName: z.string().min(1),
  accountNumber: z.string().regex(/^[0-9]{9,18}$/, "Enter a valid bank account number"),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, "Enter a valid IFSC code (e.g. HDFC0001234)"),
});

/** Adding an account immediately triggers online penny-drop verification - see BankAccountService.add. */
bankAccountsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const account = await bankAccountService.add(req.userId!, parsed.data);
    res.status(201).json(account);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

bankAccountsRouter.post("/:id/verify", async (req: AuthedRequest, res) => {
  try {
    const account = await bankAccountService.verify(req.userId!, req.params.id);
    res.json(account);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

bankAccountsRouter.patch("/:id/primary", async (req: AuthedRequest, res) => {
  try {
    const account = await bankAccountService.setPrimary(req.userId!, req.params.id);
    res.json(account);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

bankAccountsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  try {
    await bankAccountService.remove(req.userId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});
