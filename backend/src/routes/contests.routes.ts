import { Router } from "express";
import { requireAuth, AuthedRequest } from "../middleware/auth.middleware";
import { prisma } from "../utils/prisma";
import { leaderboardService } from "../engine/LeaderboardService";
import { contestPortfolioService } from "../engine/ContestPortfolioService";
import { prizeService } from "../services/PrizeService";

export const contestsRouter = Router();
contestsRouter.use(requireAuth);

// NOTE: contest creation is admin-only - see routes/adminContests.routes.ts
// (mounted at /api/admin/contests). This router is read/join only.

contestsRouter.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  const contests = await prisma.contest.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { startDate: "desc" },
    include: { _count: { select: { participants: true } } },
  });
  res.json(contests);
});

contestsRouter.get("/:id", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { participants: true } } },
  });
  if (!contest) return res.status(404).json({ error: "Contest not found" });
  res.json(contest);
});

/** Join a contest: creates the participant's isolated virtual wallet, seeded with the contest's starting cash. */
contestsRouter.post("/:id/join", async (req: AuthedRequest, res) => {
  const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
  if (!contest) return res.status(404).json({ error: "Contest not found" });
  if (contest.status === "ENDED" || contest.status === "CANCELLED") {
    return res.status(400).json({ error: `Cannot join a contest that has ${contest.status.toLowerCase()}` });
  }

  const existing = await prisma.contestParticipant.findUnique({
    where: { contestId_userId: { contestId: contest.id, userId: req.userId! } },
  });
  if (existing) return res.status(409).json({ error: "You have already joined this contest" });

  if (contest.maxParticipants) {
    const count = await prisma.contestParticipant.count({ where: { contestId: contest.id } });
    if (count >= contest.maxParticipants) return res.status(400).json({ error: "Contest is full" });
  }

  const participant = await prisma.contestParticipant.create({
    data: {
      contestId: contest.id,
      userId: req.userId!,
      cashBalance: contest.startingVirtualCash,
    },
  });

  // Seed an initial snapshot at par so day-one volatility isn't undefined/zero-length.
  await prisma.contestPortfolioSnapshot.create({
    data: { contestParticipantId: participant.id, nav: contest.startingVirtualCash },
  });

  res.status(201).json(participant);
});

/** The current user's own entry in a contest: wallet, positions, holdings, cached rank. */
contestsRouter.get("/:id/me", async (req: AuthedRequest, res) => {
  const participant = await prisma.contestParticipant.findUnique({
    where: { contestId_userId: { contestId: req.params.id, userId: req.userId! } },
  });
  if (!participant) return res.status(404).json({ error: "You have not joined this contest" });

  const snapshot = await contestPortfolioService.getPortfolioSnapshot(participant.id);
  res.json(snapshot);
});

/**
 * Leaderboard, ranked by composite return/risk score (see LeaderboardService).
 * Serves the cached per-participant scores from the last snapshot cycle by
 * default (fast); pass ?recompute=true to force a fresh computation, e.g.
 * for a "final results" view right as a contest ends.
 */
contestsRouter.get("/:id/leaderboard", async (req, res) => {
  const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
  if (!contest) return res.status(404).json({ error: "Contest not found" });

  const participants = await prisma.contestParticipant.findMany({
    where: { contestId: contest.id },
    include: { user: true },
    orderBy: [{ rank: "asc" }, { joinedAt: "asc" }],
  });

  // Recompute if explicitly requested or if participants are missing ranks/scores
  const needsRecompute =
    req.query.recompute === "true" ||
    participants.some((p) => p.rank == null || p.lastScoredAt == null);

  if (needsRecompute && participants.length > 0) {
    const rows = await leaderboardService.computeLeaderboard(contest.id);
    return res.json(rows);
  }

  const startingCash = Number(contest.startingVirtualCash);

  res.json(
    participants.map((p) => ({
      contestParticipantId: p.id,
      userId: p.userId,
      name: p.user.name,
      nav: Math.round((startingCash * (1 + (p.returnPct ?? 0) / 100)) * 100) / 100,
      returnPct: p.returnPct ?? 0,
      riskScore: p.riskScore ?? 0,
      maxDrawdownPct: p.maxDrawdownPct ?? 0,
      compositeScore: p.compositeScore ?? 0,
      rank: p.rank ?? null,
      lastScoredAt: p.lastScoredAt,
    }))
  );
});

/**
 * Read-only prize pool breakdown (total pool + rank slabs) - shown on the
 * contest detail page so participants know what's at stake before the
 * contest even ends. No per-user PII here; see /:id/my-prize for that.
 */
contestsRouter.get("/:id/prizes", async (req, res) => {
  const config = await prizeService.getPrizeConfig(req.params.id);
  res.json(config);
});

/**
 * The current user's own prize award for this contest, if one has been
 * computed (only exists once the contest has ended and had a prize pool >
 * 0) - gross amount, TDS deducted, net payable, and payout status/reason.
 * See docs/PRIZES_AND_PAYOUTS.md.
 */
contestsRouter.get("/:id/my-prize", async (req: AuthedRequest, res) => {
  const award = await prizeService.getMyAward(req.params.id, req.userId!);
  if (!award) return res.status(404).json({ error: "No prize award for you in this contest" });
  res.json(award);
});
