import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Contest, ContestsAPI, LeaderboardRow, PrizePoolInfo, MyPrizeAward } from "../services/api";
import { useAuth } from "../store/AuthContext";

const PRIZE_STATUS_LABEL: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PENDING_KYC: { label: "Waiting on KYC Verification", color: "#d29922", bg: "rgba(210, 153, 34, 0.15)", border: "rgba(210, 153, 34, 0.3)" },
  PENDING_BANK: { label: "Waiting on Bank Verification", color: "#d29922", bg: "rgba(210, 153, 34, 0.15)", border: "rgba(210, 153, 34, 0.3)" },
  READY: { label: "Ready to Release", color: "#60a5fa", bg: "rgba(96, 165, 250, 0.15)", border: "rgba(96, 165, 250, 0.3)" },
  PROCESSING: { label: "Payout in Progress", color: "#c084fc", bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.3)" },
  PAID: { label: "Paid Out to Bank", color: "#16a34a", bg: "rgba(22, 163, 74, 0.15)", border: "rgba(22, 163, 74, 0.3)" },
  CREDITED_TO_WALLET: { label: "Credited to Wallet", color: "#16a34a", bg: "rgba(22, 163, 74, 0.15)", border: "rgba(22, 163, 74, 0.3)" },
  FAILED: { label: "Payout Failed - Contact Support", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.3)" },
};

const CONTEST_STATUS_BADGE: Record<string, { label: string; bg: string; border: string; color: string }> = {
  ACTIVE: { label: "ACTIVE", bg: "rgba(22, 163, 74, 0.15)", border: "rgba(22, 163, 74, 0.35)", color: "#16a34a" },
  UPCOMING: { label: "UPCOMING", bg: "rgba(59, 130, 246, 0.15)", border: "rgba(59, 130, 246, 0.35)", color: "#3b82f6" },
  ENDED: { label: "ENDED", bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.35)", color: "#a855f7" },
  CANCELLED: { label: "CANCELLED", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.35)", color: "#ef4444" },
};

function getAvatarBg(name: string) {
  const colors = [
    "linear-gradient(135deg, #6366f1, #8b5cf6)",
    "linear-gradient(135deg, #3b82f6, #1d4ed8)",
    "linear-gradient(135deg, #10b981, #047857)",
    "linear-gradient(135deg, #f59e0b, #b45309)",
    "linear-gradient(135deg, #ec4899, #be185d)",
    "linear-gradient(135deg, #8b5cf6, #6d28d9)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string) {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function ContestDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [contest, setContest] = useState<Contest | null>(null);
  const [joined, setJoined] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [prizePool, setPrizePool] = useState<PrizePoolInfo | null>(null);
  const [myPrize, setMyPrize] = useState<MyPrizeAward | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);

    // Fetch the contest first so we know its status before deciding whether to
    // force a leaderboard recompute (we only force for ACTIVE contests to avoid
    // unnecessary heavy computation on already-finalized ENDED contests).
    ContestsAPI.get(id)
      .then((res) => {
        const c = res.data;
        setContest(c);

        // For ACTIVE contests: force a recompute so the leaderboard always
        // reflects live NAV — this fixes stale zero scores that get cached after
        // the first cron snapshot cycle when participants haven't yet traded.
        const forceRecompute = c.status === "ACTIVE";
        ContestsAPI.leaderboard(id, forceRecompute)
          .then((lb) => {
            setLeaderboard(lb.data.slice(0, 5));
            // Re-fetch "me" AFTER the leaderboard recompute so the "Your Contest
            // Portfolio Performance" card reflects the freshly persisted scores
            // (returnPct, riskScore, maxDrawdownPct, compositeScore, rank).
            ContestsAPI.me(id)
              .then((me) => {
                setJoined(true);
                setMe(me.data);
              })
              .catch(() => {
                // Not joined — keep joined=false but don't overwrite a previous me
              });
          })
          .catch(() => {
            /* leaderboard load failed — non-fatal */
          });
      })
      .catch((err) => setError(err.response?.data?.error ?? "Failed to load contest"))
      .finally(() => setLoading(false));

    // These can run in parallel with the above
    ContestsAPI.prizePool(id).then((res) => setPrizePool(res.data)).catch(() => {});
    ContestsAPI.myPrize(id)
      .then((res) => setMyPrize(res.data))
      .catch(() => setMyPrize(null));
  }


  useEffect(load, [id]);

  async function join() {
    if (!id) return;
    setError(null);
    setJoining(true);
    try {
      await ContestsAPI.join(id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Could not join contest");
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px" }}>
        <div
          style={{
            background: "var(--bg-surface)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 32,
            textAlign: "center",
            color: "var(--text-secondary)",
          }}
        >
          Loading contest details...
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px" }}>
        <div
          style={{
            background: "var(--bg-surface)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 16,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h3 style={{ color: "#ef4444", marginBottom: 12 }}>Contest Not Found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20 }}>
            The requested contest does not exist or may have been removed.
          </p>
          <Link
            to="/contests"
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ← Back to All Contests
          </Link>
        </div>
      </div>
    );
  }

  const badge = CONTEST_STATUS_BADGE[contest.status] ?? {
    label: contest.status,
    bg: "rgba(255,255,255,0.1)",
    border: "rgba(255,255,255,0.2)",
    color: "var(--text-primary)",
  };

  const participantCount = contest._count?.participants ?? 0;
  const isFull = contest.maxParticipants ? participantCount >= contest.maxParticipants : false;
  const pctCapacity = contest.maxParticipants ? Math.round((participantCount / contest.maxParticipants) * 100) : 0;
  const startingCash = Number(contest.startingVirtualCash || 100000);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 48px" }}>
      <div style={{ marginBottom: 16 }}>
        <Link
          to="/contests"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: "#3b82f6",
            textDecoration: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Contests
        </Link>
      </div>

      {/* Main Banner */}
      <div
        style={{
          background: "var(--bg-surface)",
          backdropFilter: "blur(16px)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "24px 28px",
          marginBottom: 24,
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
                {contest.name}
              </h1>
              <span
                style={{
                  background: badge.bg,
                  border: `1px solid ${badge.border}`,
                  color: badge.color,
                  padding: "4px 12px",
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                }}
              >
                ● {badge.label}
              </span>
              {contest.durationType && (
                <span
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    padding: "4px 12px",
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {contest.durationType}
                </span>
              )}
            </div>

            {contest.description && (
              <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 780, lineHeight: 1.5 }}>
                {contest.description}
              </p>
            )}
          </div>

          <div>
            {!joined ? (
              <button
                onClick={join}
                disabled={joining || contest.status === "ENDED" || contest.status === "CANCELLED" || isFull}
                style={{
                  padding: "12px 24px",
                  borderRadius: 10,
                  border: "none",
                  background: isFull || contest.status === "ENDED" || contest.status === "CANCELLED"
                    ? "var(--bg-elevated)"
                    : "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: joining || isFull || contest.status === "ENDED" || contest.status === "CANCELLED" ? "not-allowed" : "pointer",
                  boxShadow: isFull || contest.status === "ENDED" ? "none" : "0 4px 20px rgba(37, 99, 235, 0.35)",
                  transition: "all 0.15s",
                }}
              >
                {joining ? "Joining..." : isFull ? "Contest Full" : contest.status === "ENDED" ? "Contest Ended" : "Join Competition"}
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span
                  style={{
                    background: "rgba(22, 163, 74, 0.15)",
                    border: "1px solid rgba(22, 163, 74, 0.35)",
                    color: "#16a34a",
                    padding: "6px 14px",
                    borderRadius: 99,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  ✓ You're Registered
                </span>
                <Link
                  to={`/trade?contestId=${contest.id}`}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    boxShadow: "0 4px 16px rgba(37, 99, 235, 0.35)",
                  }}
                >
                  Trade in Contest →
                </Link>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Contest Highlights Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "var(--bg-surface)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "18px 20px",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>
            STARTING VIRTUAL CASH
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>
            ₹{Number(contest.startingVirtualCash).toLocaleString("en-IN")}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "18px 20px",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>
            PARTICIPANTS
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#3b82f6", marginBottom: 4 }}>
            {participantCount}
            {contest.maxParticipants ? ` / ${contest.maxParticipants}` : ""}
          </div>
          {contest.maxParticipants && (
            <div style={{ width: "100%", height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, pctCapacity)}%`, height: "100%", background: "#3b82f6" }} />
            </div>
          )}
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "18px 20px",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>
            RANKING FORMULA WEIGHTS
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            Return: <span style={{ color: "#16a34a" }}>{Math.round(contest.returnWeight * 100)}%</span> | Risk:{" "}
            <span style={{ color: "#9333ea" }}>{Math.round(contest.riskWeight * 100)}%</span>
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "18px 20px",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>
            COMPETITION DATES
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            {new Date(contest.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} -{" "}
            {new Date(contest.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* Prize Pool Slab */}
      {prizePool && Number(prizePool.totalPrizePool) > 0 && (
        <div
          style={{
            background: "var(--bg-surface)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <span>🏆</span> Prize Pool: ₹{Number(prizePool.totalPrizePool).toLocaleString("en-IN")}
            </h3>
          </div>

          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    Rank Slabs
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    Pool %
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    Est. Reward / Winner
                  </th>
                </tr>
              </thead>
              <tbody>
                {prizePool.slabs.map((s, idx) => {
                  const winners = Math.max(1, s.rankTo - s.rankFrom + 1);
                  const rewardPerWinner = (Number(prizePool.totalPrizePool) * (s.percentage / 100)) / winners;
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 12px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {s.rankFrom === s.rankTo ? `#${s.rankFrom}` : `#${s.rankFrom} - #${s.rankTo}`}
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right", fontWeight: 700, color: "#3b82f6" }}>
                        {s.percentage}%
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                        ₹{rewardPerWinner.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5 }}>
            💡 Winnings are subject to TDS under Indian Tax laws and are distributed automatically upon contest termination. Ensure your KYC and bank details are verified in your profile.
          </p>
        </div>
      )}

      {/* User's Own Performance Card */}
      {joined && me?.participant && (
        <div
          style={{
            background: "var(--bg-surface)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
              Your Contest Portfolio Performance
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Contest ID: {contest.id.slice(0, 8)}...
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
            {/* Rank Card */}
            <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                CURRENT RANK
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#3b82f6" }}>
                {me.participant.rank ? (
                  me.participant.rank === 1 ? "🥇 #1" :
                  me.participant.rank === 2 ? "🥈 #2" :
                  me.participant.rank === 3 ? "🥉 #3" : `#${me.participant.rank}`
                ) : "Pending Calculation"}
              </div>
            </div>

            {/* Cash Balance */}
            <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                CASH BALANCE
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                ₹{Number(me.participant.cashBalance).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Realized P&L */}
            <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                REALIZED P&amp;L
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: Number(me.participant.realizedPnL) >= 0 ? "#16a34a" : "#dc2626",
                }}
              >
                {Number(me.participant.realizedPnL) >= 0 ? "+" : ""}₹{Number(me.participant.realizedPnL).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Return % */}
            <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                RETURN %
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: Number(me.participant.returnPct ?? 0) >= 0 ? "#16a34a" : "#dc2626",
                }}
              >
                {Number(me.participant.returnPct ?? 0) >= 0 ? "+" : ""}{Number(me.participant.returnPct ?? 0).toFixed(2)}%
              </div>
            </div>

            {/* Max Drawdown % */}
            <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                MAX DRAWDOWN %
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#ef4444" }}>
                {Number(me.participant.maxDrawdownPct ?? 0).toFixed(2)}%
              </div>
            </div>

            {/* Risk Volatility */}
            <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                RISK (VOLATILITY)
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                {Number(me.participant.riskScore ?? 0).toFixed(2)}%
              </div>
            </div>

            {/* Composite Score */}
            <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                COMPOSITE SCORE
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#2563eb" }}>
                {Number(me.participant.compositeScore ?? 0).toFixed(3)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard (Top 5) Table */}
      <div
        style={{
          background: "var(--bg-surface)",
          backdropFilter: "blur(16px)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
            Leaderboard (Top 5)
          </h3>
          <Link
            to={`/contests/${contest.id}/leaderboard`}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#3b82f6",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            View Full Leaderboard →
          </Link>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", width: 70 }}>
                  Rank
                </th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Trader
                </th>
                <th style={{ padding: "12px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  NAV
                </th>
                <th style={{ padding: "12px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Return %
                </th>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Risk (Volatility)
                </th>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Max Drawdown %
                </th>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Composite Score
                </th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => {
                const r = row.rank;
                const isMe = row.userId === user?.id;

                let rankDisplay: React.ReactNode = r ?? "-";
                if (r === 1) {
                  rankDisplay = (
                    <span
                      style={{
                        background: "linear-gradient(135deg, #f59e0b, #d97706)",
                        color: "#fff",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      🥇 #1
                    </span>
                  );
                } else if (r === 2) {
                  rankDisplay = (
                    <span
                      style={{
                        background: "linear-gradient(135deg, #94a3b8, #64748b)",
                        color: "#fff",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      🥈 #2
                    </span>
                  );
                } else if (r === 3) {
                  rankDisplay = (
                    <span
                      style={{
                        background: "linear-gradient(135deg, #b45309, #78350f)",
                        color: "#fff",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      🥉 #3
                    </span>
                  );
                } else if (r) {
                  rankDisplay = <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>#{r}</span>;
                }

                const navVal = row.nav ?? (startingCash * (1 + (row.returnPct ?? 0) / 100));

                return (
                  <tr
                    key={row.contestParticipantId}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: isMe ? "rgba(59, 130, 246, 0.1)" : "transparent",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = isMe ? "rgba(59, 130, 246, 0.16)" : "var(--bg-elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = isMe ? "rgba(59, 130, 246, 0.1)" : "transparent")}
                  >
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>{rankDisplay}</td>
                    <td style={{ padding: "14px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: getAvatarBg(row.name || "T"),
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(row.name || "Trader")}
                        </div>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{row.name}</span>
                          {isMe && (
                            <span style={{ marginLeft: 8, background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                              YOU
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {navVal != null ? `₹${Number(navVal).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: row.returnPct >= 0 ? "#16a34a" : "#dc2626",
                          background: row.returnPct >= 0 ? "rgba(22, 163, 74, 0.1)" : "rgba(220, 38, 38, 0.1)",
                          padding: "3px 8px",
                          borderRadius: 6,
                          display: "inline-block",
                        }}
                      >
                        {row.returnPct >= 0 ? "+" : ""}
                        {row.returnPct.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      <span
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {row.riskScore.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      <span
                        style={{
                          background: "rgba(239, 68, 68, 0.08)",
                          color: "#ef4444",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {Number(row.maxDrawdownPct ?? 0).toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      <span
                        style={{
                          background: "rgba(59, 130, 246, 0.12)",
                          border: "1px solid rgba(59, 130, 246, 0.25)",
                          color: "#2563eb",
                          padding: "3px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {Number(row.compositeScore ?? 0).toFixed(3)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                    No scored entries yet — leaderboard rankings update periodically once the contest starts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
