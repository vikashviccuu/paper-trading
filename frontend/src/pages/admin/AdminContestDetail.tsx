import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AdminContestsAPI } from "../../services/adminApi";

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

export default function AdminContestDetail() {
  const { id } = useParams<{ id: string }>();
  const [contest, setContest] = useState<any>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    if (!id) return;
    AdminContestsAPI.get(id)
      .then((res) => setContest(res.data))
      .catch((err) => setMessage({ text: err.response?.data?.error ?? "Failed to fetch contest", type: "error" }))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function cancelContest() {
    if (!id) return;
    if (!confirm("Are you sure you want to cancel this contest? Participants will be notified.")) return;
    setBusy(true);
    setMessage(null);
    try {
      await AdminContestsAPI.cancel(id);
      setMessage({ text: "Contest cancelled successfully.", type: "success" });
      load();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.error ?? "Could not cancel contest", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function endNow() {
    if (!id) return;
    if (!confirm("This immediately force-closes every participant's open positions/holdings at current market price and locks the final leaderboard. Continue?")) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await AdminContestsAPI.endNow(id);
      setMessage({
        text: `Contest ended. ${res.data.positionsClosed ?? 0} positions and ${res.data.holdingsClosed ?? 0} holdings squared off.`,
        type: "success",
      });
      load();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.error ?? "Could not end contest", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 0", textAlign: "center" }}>
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
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 0" }}>
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
            The requested contest ID could not be found or may have been deleted.
          </p>
          <Link
            to="/admin"
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
            ← Return to Admin Dashboard
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

  const participantCount = contest.participants?.length ?? 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 0 40px" }}>
      {/* Top Banner Card */}
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
        <div style={{ marginBottom: 16 }}>
          <Link
            to="/admin"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "#60a5fa",
              textDecoration: "none",
              transition: "all 0.15s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Admin Dashboard
          </Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
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
            </div>

            {contest.description && (
              <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 800, lineHeight: 1.5 }}>
                {contest.description}
              </p>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {contest.status === "ACTIVE" && (
              <button
                onClick={endNow}
                disabled={busy}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  background: "linear-gradient(135deg, rgba(217, 119, 6, 0.2), rgba(180, 83, 9, 0.3))",
                  color: "#fbbf24",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: busy ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 16px rgba(245, 158, 11, 0.2)",
                  transition: "all 0.15s",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
                {busy ? "Processing..." : "End Now (Square-off)"}
              </button>
            )}

            {(contest.status === "UPCOMING" || contest.status === "ACTIVE") && (
              <button
                onClick={cancelContest}
                disabled={busy}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid rgba(248, 81, 73, 0.35)",
                  background: "rgba(248, 81, 73, 0.12)",
                  color: "#f85149",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: busy ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                Cancel Contest
              </button>
            )}

            <Link
              to={`/admin/contests/${id}/prizes`}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 4px 16px rgba(37, 99, 235, 0.35)",
                transition: "all 0.15s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
              </svg>
              Manage Prizes &amp; Payouts →
            </Link>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              borderRadius: 10,
              background: message.type === "success" ? "rgba(63, 185, 80, 0.15)" : "rgba(248, 81, 73, 0.15)",
              border: `1px solid ${message.type === "success" ? "rgba(63, 185, 80, 0.35)" : "rgba(248, 81, 73, 0.35)"}`,
              color: message.type === "success" ? "#3fb950" : "#f85149",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span>{message.type === "success" ? "✓" : "⚠"}</span>
            {message.text}
          </div>
        )}
      </div>

      {/* Info Stats Cards Grid */}
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
            START DATE &amp; TIME
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
            {new Date(contest.startDate).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
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
            END DATE (MARKET CLOSE)
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
            {new Date(contest.endDate).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
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
            SQUARED OFF AT
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: contest.squaredOffAt ? "#fbbf24" : "var(--text-secondary)" }}>
            {contest.squaredOffAt
              ? new Date(contest.squaredOffAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Not Squared Off"}
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
            TOTAL PARTICIPANTS
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#60a5fa" }}>
            {participantCount} Trader{participantCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Leaderboard Table Card */}
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
            Participant Leaderboard
          </h3>
          <span
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: "4px 12px",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            {participantCount} Registered
          </span>
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
                  Cash Balance
                </th>
                <th style={{ padding: "12px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Realized P&amp;L
                </th>
                <th style={{ padding: "12px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Return %
                </th>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Risk Score
                </th>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Composite Score
                </th>
              </tr>
            </thead>
            <tbody>
              {contest.participants?.map((p: any) => {
                const pnl = Number(p.realizedPnL || 0);
                const returnPct = p.returnPct != null ? Number(p.returnPct) : null;
                const r = p.rank;

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
                        boxShadow: "0 2px 8px rgba(245, 158, 11, 0.35)",
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
                    key={p.id}
                    style={{
                      borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>{rankDisplay}</td>
                    <td style={{ padding: "14px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            background: getAvatarBg(p.user?.name || "U"),
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(p.user?.name || "User")}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{p.user?.name || "Unknown"}</div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.user?.email || "-"}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                      ₹{Number(p.cashBalance || 0).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: pnl >= 0 ? "#3fb950" : "#f85149",
                          background: pnl >= 0 ? "rgba(63, 185, 80, 0.1)" : "rgba(248, 81, 73, 0.1)",
                          padding: "3px 8px",
                          borderRadius: 6,
                          border: `1px solid ${pnl >= 0 ? "rgba(63, 185, 80, 0.25)" : "rgba(248, 81, 73, 0.25)"}`,
                        }}
                      >
                        {pnl >= 0 ? "+" : ""}₹{pnl.toLocaleString("en-IN")}
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "right", fontSize: 13, fontWeight: 700, color: returnPct != null ? (returnPct >= 0 ? "#3fb950" : "#f85149") : "var(--text-secondary)" }}>
                      {returnPct != null ? `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%` : "-"}
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      {p.riskScore != null ? (
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
                          {Number(p.riskScore).toFixed(2)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      {p.compositeScore != null ? (
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
                          {Number(p.compositeScore).toFixed(3)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}

              {(!contest.participants || contest.participants.length === 0) && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                    No traders have joined this contest yet.
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

