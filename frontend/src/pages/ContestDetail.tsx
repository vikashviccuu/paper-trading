import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Contest, ContestsAPI, LeaderboardRow, PrizePoolInfo, MyPrizeAward } from "../services/api";

const PRIZE_STATUS_LABEL: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PENDING_KYC: { label: "Waiting on KYC Verification", color: "#d29922", bg: "rgba(210, 153, 34, 0.15)", border: "rgba(210, 153, 34, 0.3)" },
  PENDING_BANK: { label: "Waiting on Bank Verification", color: "#d29922", bg: "rgba(210, 153, 34, 0.15)", border: "rgba(210, 153, 34, 0.3)" },
  READY: { label: "Ready to Release", color: "#60a5fa", bg: "rgba(96, 165, 250, 0.15)", border: "rgba(96, 165, 250, 0.3)" },
  PROCESSING: { label: "Payout in Progress", color: "#c084fc", bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.3)" },
  PAID: { label: "Paid Out to Bank", color: "#3fb950", bg: "rgba(63, 185, 80, 0.15)", border: "rgba(63, 185, 80, 0.3)" },
  CREDITED_TO_WALLET: { label: "Credited to Wallet", color: "#3fb950", bg: "rgba(63, 185, 80, 0.15)", border: "rgba(63, 185, 80, 0.3)" },
  FAILED: { label: "Payout Failed - Contact Support", color: "#f85149", bg: "rgba(248, 81, 73, 0.15)", border: "rgba(248, 81, 73, 0.3)" },
};

const CONTEST_STATUS_BADGE: Record<string, { label: string; bg: string; border: string; color: string }> = {
  ACTIVE: { label: "ACTIVE", bg: "rgba(63, 185, 80, 0.15)", border: "rgba(63, 185, 80, 0.35)", color: "#3fb950" },
  UPCOMING: { label: "UPCOMING", bg: "rgba(96, 165, 250, 0.15)", border: "rgba(96, 165, 250, 0.35)", color: "#60a5fa" },
  ENDED: { label: "ENDED", bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.35)", color: "#c084fc" },
  CANCELLED: { label: "CANCELLED", bg: "rgba(248, 81, 73, 0.15)", border: "rgba(248, 81, 73, 0.35)", color: "#f85149" },
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
    ContestsAPI.get(id)
      .then((res) => setContest(res.data))
      .catch((err) => setError(err.response?.data?.error ?? "Failed to load contest"))
      .finally(() => setLoading(false));

    ContestsAPI.me(id)
      .then((res) => {
        setJoined(true);
        setMe(res.data);
      })
      .catch(() => setJoined(false));

    ContestsAPI.leaderboard(id).then((res) => setLeaderboard(res.data.slice(0, 5)));
    ContestsAPI.prizePool(id).then((res) => setPrizePool(res.data));
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
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
        <div
          style={{
            background: "rgba(13, 17, 28, 0.75)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 16,
            padding: "48px 24px",
            color: "var(--text-secondary)",
            fontSize: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              border: "3px solid rgba(255,255,255,0.1)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              margin: "0 auto 16px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          Loading contest details...
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <div
          style={{
            background: "rgba(13, 17, 28, 0.75)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(248, 81, 73, 0.3)",
            borderRadius: 16,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h3 style={{ color: "#f85149", marginBottom: 12 }}>Contest Not Found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20 }}>
            The requested contest does not exist or may have been removed.
          </p>
          <Link
            to="/contests"
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "rgba(255, 255, 255, 0.08)",
              color: "#fff",
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
    color: "#fff",
  };

  const participantCount = contest._count?.participants ?? 0;
  const isFull = contest.maxParticipants ? participantCount >= contest.maxParticipants : false;
  const pctCapacity = contest.maxParticipants ? Math.round((participantCount / contest.maxParticipants) * 100) : 0;

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
            color: "#60a5fa",
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

      <div
        style={{
          background: "rgba(13, 17, 28, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 16,
          padding: "24px 28px",
          marginBottom: 24,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
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
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
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
                    ? "rgba(255, 255, 255, 0.1)"
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
                    background: "rgba(63, 185, 80, 0.15)",
                    border: "1px solid rgba(63, 185, 80, 0.35)",
                    color: "#3fb950",
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
              background: "rgba(248, 81, 73, 0.15)",
              border: "1px solid rgba(248, 81, 73, 0.35)",
              color: "#f85149",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ⚠ {error}
          </div>
        )}
      </div>

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
            background: "rgba(13, 17, 28, 0.75)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 14,
            padding: "18px 20px",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>
            STARTING VIRTUAL CASH
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#3fb950" }}>
            ₹{Number(contest.startingVirtualCash).toLocaleString("en-IN")}
          </div>
        </div>

        <div
          style={{
            background: "rgba(13, 17, 28, 0.75)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 14,
            padding: "18px 20px",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>
            PARTICIPANTS
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#60a5fa", marginBottom: 4 }}>
            {participantCount}
            {contest.maxParticipants ? ` / ${contest.maxParticipants}` : ""}
          </div>
          {contest.maxParticipants && (
            <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, pctCapacity)}%`, height: "100%", background: "#60a5fa" }} />
            </div>
          )}
        </div>

        <div
          style={{
            background: "rgba(13, 17, 28, 0.75)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 14,
            padding: "18px 20px",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>
            RANKING FORMULA WEIGHTS
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
            Return: <span style={{ color: "#3fb950" }}>{Math.round(contest.returnWeight * 100)}%</span> | Risk:{" "}
            <span style={{ color: "#c084fc" }}>{Math.round(contest.riskWeight * 100)}%</span>
          </div>
        </div>

        <div
          style={{
            background: "rgba(13, 17, 28, 0.75)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 14,
            padding: "18px 20px",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>
            COMPETITION DATES
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
            {new Date(contest.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} -{" "}
            {new Date(contest.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      {myPrize && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(180, 83, 9, 0.15))",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: "0 10px 30px rgba(245, 158, 11, 0.15)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 24 }}>🏆</span>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24", letterSpacing: "-0.3px" }}>
              Congratulations! You won a prize
            </h3>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>FINAL RANK</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>#{myPrize.rank}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>GROSS AWARD</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>₹{Number(myPrize.grossAmount).toLocaleString("en-IN")}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>TDS ({myPrize.tdsRatePct}%)</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f85149" }}>₹{Number(myPrize.tdsAmount).toLocaleString("en-IN")}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>NET PAYABLE</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#3fb950" }}>₹{Number(myPrize.netAmount).toLocaleString("en-IN")}</div>
            </div>
          </div>

          {(() => {
            const st = PRIZE_STATUS_LABEL[myPrize.payoutStatus] ?? {
              label: myPrize.payoutStatus,
              color: "#fff",
              bg: "rgba(255,255,255,0.1)",
              border: "rgba(255,255,255,0.2)",
            };
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ color: "rgba(255,255,255,0.8)" }}>Payout Status:</span>
                <span
                  style={{
                    background: st.bg,
                    border: `1px solid ${st.border}`,
                    color: st.color,
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {st.label}
                </span>
                {myPrize.blockedReason && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>— {myPrize.blockedReason}</span>}
              </div>
            );
          })()}
        </div>
      )}

      {joined && me?.participant && (
        <div
          style={{
            background: "rgba(13, 17, 28, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 16 }}>
            Your Contest Portfolio Performance
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 16, borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 4 }}>CASH BALANCE</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>
                ₹{Number(me.participant.cashBalance).toLocaleString("en-IN")}
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 16, borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 4 }}>REALIZED P&amp;L</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: Number(me.participant.realizedPnL) >= 0 ? "#3fb950" : "#f85149",
                }}
              >
                {Number(me.participant.realizedPnL) >= 0 ? "+" : ""}₹{Number(me.participant.realizedPnL).toLocaleString("en-IN")}
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 16, borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 4 }}>CURRENT RANK</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#60a5fa" }}>
                {me.participant.rank ? `#${me.participant.rank}` : "Pending Snapshot"}
              </div>
            </div>
          </div>
        </div>
      )}

      {prizePool && Number(prizePool.totalPrizePool) > 0 && (
        <div
          style={{
            background: "rgba(13, 17, 28, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
              <span>🏆</span> Prize Pool: ₹{Number(prizePool.totalPrizePool).toLocaleString("en-IN")}
            </h3>
          </div>

          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
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
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "12px 12px", fontWeight: 700, color: "#fff" }}>
                        {s.rankFrom === s.rankTo ? `#${s.rankFrom}` : `#${s.rankFrom} - #${s.rankTo}`}
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right", fontWeight: 700, color: "#60a5fa" }}>
                        {s.percentage}%
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right", fontWeight: 700, color: "#3fb950" }}>
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

      <div
        style={{
          background: "rgba(13, 17, 28, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
            Leaderboard (Top 5)
          </h3>
          <Link
            to={`/contests/${contest.id}/leaderboard`}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#60a5fa",
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
              <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", width: 70 }}>
                  Rank
                </th>
                <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Trader
                </th>
                <th style={{ padding: "12px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Return %
                </th>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Risk (Volatility)
                </th>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Composite Score
                </th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => {
                const r = row.rank;
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

                return (
                  <tr
                    key={row.contestParticipantId}
                    style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", transition: "background 0.15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{row.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: row.returnPct >= 0 ? "#3fb950" : "#f85149",
                          background: row.returnPct >= 0 ? "rgba(63, 185, 80, 0.1)" : "rgba(248, 81, 73, 0.1)",
                          padding: "3px 8px",
                          borderRadius: 6,
                        }}
                      >
                        {row.returnPct >= 0 ? "+" : ""}
                        {row.returnPct.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      <span
                        style={{
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {row.riskScore.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      <span
                        style={{
                          background: "rgba(96, 165, 250, 0.15)",
                          border: "1px solid rgba(96, 165, 250, 0.3)",
                          color: "#60a5fa",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {row.compositeScore.toFixed(3)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
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
