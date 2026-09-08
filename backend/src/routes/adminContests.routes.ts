import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAdminAuth, AdminAuthedRequest } from "../middleware/adminAuth.middleware";
import { prisma } from "../utils/prisma";
import { env } from "../config/env";
import { computeContestEndDate } from "../utils/contestDuration";
import { contestEndService } from "../engine/ContestEndService";
import { prizeService } from "../services/PrizeService";
import { AppError } from "../engine/OrderEngine";

export const adminContestsRouter = Router();
adminContestsRouter.use(requireAdminAuth);

const durationEnum = z.enum(["WEEKLY", "MONTHLY", "HALF_YEARLY", "YEARLY", "CUSTOM"]);

const createContestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    durationType: durationEnum,
    startDate: z.string(), // ISO
    endDate: z.string().optional(), // ISO - required only when durationType = CUSTOM
    startingVirtualCash: z.number().positive().optional(),
    maxParticipants: z.number().int().positive().optional(),
    returnWeight: z.number().min(0).max(1).optional(),
    riskWeight: z.number().min(0).max(1).optional(),
  })
  .refine((d) => d.durationType !== "CUSTOM" || !!d.endDate, {
    message: "endDate is required when durationType is CUSTOM",
    path: ["endDate"],
  });

/**
 * Contest hosting is admin-only: this is the only route that can create a
 * Contest row (the public /api/contests router only lists/joins/reads).
 * WEEKLY/MONTHLY/HALF_YEARLY/YEARLY contests get their endDate computed
 * automatically, pinned to market close on the last day - see
 * utils/contestDuration.ts and docs/CONTESTS.md.
 */
adminContestsRouter.post("/", async (req: AdminAuthedRequest, res) => {
  const parsed = createContestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const startDate = new Date(d.startDate);
  const endDate =
    d.durationType === "CUSTOM" ? new Date(d.endDate!) : computeContestEndDate(startDate, d.durationType, env.CONTEST_MARKET_CLOSE_TIME);

  if (endDate <= startDate) return res.status(400).json({ error: "endDate must be after startDate" });

  const contest = await prisma.contest.create({
    data: {
      name: d.name,
      description: d.description,
      durationType: d.durationType,
      startDate,
      endDate,
      startingVirtualCash: new Prisma.Decimal(d.startingVirtualCash ?? 100000),
      maxParticipants: d.maxParticipants,
      returnWeight: d.returnWeight ?? 0.6,
      riskWeight: d.riskWeight ?? 0.4,
      createdByAdminId: req.adminId!,
      status: startDate <= new Date() ? "ACTIVE" : "UPCOMING",
    },
  });
  res.status(201).json(contest);
});

/** All contests (not just this admin's own), so any admin can monitor the whole platform. */
adminContestsRouter.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  const contests = await prisma.contest.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { participants: true } }, createdByAdmin: { select: { id: true, name: true, email: true } } },
  });
  res.json(contests);
});

adminContestsRouter.get("/:id", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: {
      createdByAdmin: { select: { id: true, name: true, email: true } },
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: [{ rank: "asc" }, { joinedAt: "asc" }],
      },
    },
  });
  if (!contest) return res.status(404).json({ error: "Contest not found" });
  res.json(contest);
});

const updateContestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  maxParticipants: z.number().int().positive().optional(),
  returnWeight: z.number().min(0).max(1).optional(),
  riskWeight: z.number().min(0).max(1).optional(),
});

/** Only lets you edit a contest before it's gone ACTIVE - once live, the rules shouldn't move under participants' feet. */
adminContestsRouter.patch("/:id", async (req, res) => {
  const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
  if (!contest) return res.status(404).json({ error: "Contest not found" });
  if (contest.status !== "UPCOMING") {
    return res.status(400).json({ error: "Only UPCOMING contests can be edited" });
  }
  const parsed = updateContestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.contest.update({ where: { id: contest.id }, data: parsed.data });
  res.json(updated);
});

adminContestsRouter.post("/:id/cancel", async (req, res) => {
  const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
  if (!contest) return res.status(404).json({ error: "Contest not found" });
  if (contest.status === "ENDED" || contest.status === "CANCELLED") {
    return res.status(400).json({ error: `Contest already ${contest.status.toLowerCase()}` });
  }
  const updated = await prisma.contest.update({ where: { id: contest.id }, data: { status: "CANCELLED" } });
  res.json(updated);
});

/** Admin override: force end + square-off a contest right now, regardless of endDate. */
adminContestsRouter.post("/:id/end-now", async (req, res) => {
  const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
  if (!contest) return res.status(404).json({ error: "Contest not found" });
  if (contest.status !== "ACTIVE") {
    return res.status(400).json({ error: "Only an ACTIVE contest can be ended now" });
  }
  const result = await contestEndService.endContest(contest.id);
  res.json(result);
});

// ---------------------------------------------------------------------------
// Prize pool configuration + awards. See docs/PRIZES_AND_PAYOUTS.md for the
// full flow. Pool/slabs can only be set before the contest ends (before
// PrizeService.computeAwards has locked amounts in); the awards list and
// per-award release action (below) are what admins use afterwards.
// ---------------------------------------------------------------------------

const prizeSlabSchema = z.object({
  rankFrom: z.number().int().positive(),
  rankTo: z.number().int().positive(),
  percentage: z.number().positive().max(100),
});

const setPrizeConfigSchema = z.object({
  totalPrizePool: z.number().min(0),
  slabs: z.array(prizeSlabSchema).default([]),
});

adminContestsRouter.get("/:id/prizes", async (req, res) => {
  res.json(await prizeService.getPrizeConfig(req.params.id));
});

adminContestsRouter.put("/:id/prizes", async (req, res) => {
  const parsed = setPrizeConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await prizeService.setPrizeConfig(req.params.id, parsed.data.totalPrizePool, parsed.data.slabs);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

/** Manually (re)compute awards from the current pool/slabs + final leaderboard - normally done automatically by ContestEndService when the contest ends. */
adminContestsRouter.post("/:id/prizes/compute", async (req, res) => {
  const result = await prizeService.computeAwards(req.params.id);
  res.json(result);
});

/** Per-winner award list: rank, gross/TDS/net, KYC + bank verification status, payout status - see also routes/adminPrizes.routes.ts for the release action. */
adminContestsRouter.get("/:id/prizes/awards", async (req, res) => {
  res.json(await prizeService.listForContest(req.params.id));
});
