import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Contest, ContestsAPI, LeaderboardRow } from "../services/api";
import { useAuth } from "../store/AuthContext";

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

export default function Leaderboard() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [contest, setContest] = useState<Contest | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);

  function load(recompute = false) {
    if (!id) return;
    setLoading(true);
    Promise.all([ContestsAPI.get(id), ContestsAPI.leaderboard(id, recompute)])
      .then(([c, lb]) => {
        setContest(c.data);
        setRows(lb.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), [id]);

  const returnWeightPct = Math.round((contest?.returnWeight ?? 0.6) * 100);
  const riskWeightPct = Math.round((contest?.riskWeight ?? 0.4) * 100);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 48px" }}>
      {/* Top Banner Card */}
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
        <div style={{ marginBottom: 12 }}>
          <Link
            to={id ? `/contests/${id}` : "/contests"}
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
            ← Back to Contest
          </Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
              {contest?.name ?? "Full Leaderboard"}
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, maxWidth: 740, lineHeight: 1.5 }}>
              Ranked by <strong>Composite Score</strong> = ({returnWeightPct}% × Return %) − ({riskWeightPct}% × Risk Volatility %).
              Traders with consistent positive returns and controlled drawdown rank highest.
            </p>
          </div>

          <button
            onClick={() => load(true)}
            disabled={loading}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontWeight: 700,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {loading ? "Recomputing..." : "Recompute Scores"}
          </button>
        </div>
      </div>

      {/* Leaderboard Table Card */}
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
              {rows.map((row) => {
                const isMe = row.userId === user?.id;
                const r = row.rank;

                let rankDisplay: React.ReactNode = r ?? "-";
                if (r === 1) {
                  rankDisplay = (
                    <span style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", padding: "3px 8px", borderRadius: 6, fontWeight: 800, fontSize: 12 }}>
                      🥇 #1
                    </span>
                  );
                } else if (r === 2) {
                  rankDisplay = (
                    <span style={{ background: "linear-gradient(135deg, #94a3b8, #64748b)", color: "#fff", padding: "3px 8px", borderRadius: 6, fontWeight: 800, fontSize: 12 }}>
                      🥈 #2
                    </span>
                  );
                } else if (r === 3) {
                  rankDisplay = (
                    <span style={{ background: "linear-gradient(135deg, #b45309, #78350f)", color: "#fff", padding: "3px 8px", borderRadius: 6, fontWeight: 800, fontSize: 12 }}>
                      🥉 #3
                    </span>
                  );
                } else if (r) {
                  rankDisplay = <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>#{r}</span>;
                }

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
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                            {row.name}
                          </span>
                          {isMe && (
                            <span style={{ marginLeft: 8, background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                              YOU
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {row.nav != null ? `₹${Number(row.nav).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "-"}
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
                      <span style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                        {row.riskScore.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      <span style={{ background: "rgba(239, 68, 68, 0.08)", color: "#ef4444", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                        {row.maxDrawdownPct.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      <span style={{ background: "rgba(59, 130, 246, 0.12)", border: "1px solid rgba(59, 130, 246, 0.25)", color: "#2563eb", padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 800 }}>
                        {row.compositeScore.toFixed(3)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                    No entries ranked yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formula Explanatory Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--card-shadow)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            📈 Return % Formula
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            ((Current NAV − Starting Cash) ÷ Starting Cash) × 100
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            Measures the percentage gain or loss on your total starting virtual capital, including realized trades and live open position mark-to-market.
          </div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--card-shadow)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            ⚡ Risk (Volatility) Formula
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            Sample StdDev of Periodic Return Series (σ)
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            Evaluates the volatility of your portfolio equity curve over time. Smooth, consistent portfolio growth yields low risk; erratic swings increase risk.
          </div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "var(--card-shadow)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            🏆 Composite Score Formula
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            ({returnWeightPct}% × Return %) − ({riskWeightPct}% × Risk %)
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            The primary contest ranking metric. Rewards profitable traders while penalizing reckless, high-volatility gambling to ensure fair, professional competition.
          </div>
        </div>
      </div>
    </div>
  );
}
