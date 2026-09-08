import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.middleware";
import { profileService } from "../services/ProfileService";
import { otpService } from "../services/OtpService";
import { AppError } from "../engine/OrderEngine";

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get("/", async (req: AuthedRequest, res) => {
  const profile = await profileService.getFullProfile(req.userId!);
  res.json(profile);
});

const personalSchema = z.object({
  name: z.string().min(1).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional(),
});

profileRouter.patch("/personal", async (req: AuthedRequest, res) => {
  const parsed = personalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await profileService.updatePersonal(req.userId!, parsed.data);
  res.json(updated);
});

const addressSchema = z.object({
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().regex(/^[0-9]{6}$/, "Enter a valid 6-digit PIN code").optional(),
  country: z.string().optional(),
});

profileRouter.patch("/address", async (req: AuthedRequest, res) => {
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await profileService.updateAddress(req.userId!, parsed.data);
  res.json(updated);
});

const communicationSchema = z.object({
  alternateEmail: z.string().email().optional(),
});

profileRouter.patch("/communication", async (req: AuthedRequest, res) => {
  const parsed = communicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await profileService.updateCommunication(req.userId!, parsed.data);
  res.json(updated);
});

const payoutPreferenceSchema = z.object({ preference: z.enum(["CASH_WITHDRAWAL", "PROP_TRADING"]) });

/** How future contest prize winnings should be paid out - see docs/PRIZES_AND_PAYOUTS.md. */
profileRouter.patch("/payout-preference", async (req: AuthedRequest, res) => {
  const parsed = payoutPreferenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await profileService.updatePayoutPreference(req.userId!, parsed.data.preference);
  res.json(updated);
});

const sendOtpSchema = z.object({ phone: z.string().regex(/^[6-9][0-9]{9}$/, "Enter a valid 10-digit Indian mobile number") });

profileRouter.post("/communication/phone/send-otp", async (req: AuthedRequest, res) => {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { otp, expiresAt } = await otpService.send(req.userId!, "PHONE_VERIFICATION", parsed.data.phone);
  // `otp` is only present outside production - see OtpService for why.
  res.json({ sent: true, expiresAt, otp });
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
  otp: z.string().length(6),
});

profileRouter.post("/communication/phone/verify-otp", async (req: AuthedRequest, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await otpService.verify(req.userId!, "PHONE_VERIFICATION", parsed.data.phone, parsed.data.otp);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
  const updated = await profileService.setVerifiedPhone(req.userId!, parsed.data.phone);
  res.json(updated);
});
