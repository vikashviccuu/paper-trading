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

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 48px" }}>
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
        <div style={{ marginBottom: 12 }}>
          <Link
            to={id ? `/contests/${id}` : "/contests"}
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
            ← Back to Contest
          </Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              {contest?.name ?? "Full Leaderboard"}
            </h1>
            {contest && (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, maxWidth: 700, lineHeight: 1.5 }}>
                Ranked by Composite Score = {Math.round(contest.returnWeight * 100)}% × Normalized Return −{" "}
                {Math.round(contest.riskWeight * 100)}% × Normalized Risk. Higher return and lower drawdown push rank up.
              </p>
            )}
          </div>

          <button
            onClick={() => load(true)}
            disabled={loading}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.15)",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s",
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
          background: "rgba(13, 17, 28, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
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
                  NAV
                </th>
                <th style={{ padding: "12px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Return %
                </th>
                <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  Risk (Vol %)
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
                      borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                      background: isMe ? "rgba(37, 99, 235, 0.12)" : "transparent",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = isMe ? "rgba(37, 99, 235, 0.2)" : "rgba(255, 255, 255, 0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = isMe ? "rgba(37, 99, 235, 0.12)" : "transparent")}
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
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                            {row.name}
                          </span>
                          {isMe && (
                            <span style={{ marginLeft: 8, background: "rgba(96, 165, 250, 0.2)", color: "#60a5fa", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                              YOU
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                      {row.nav != null ? `₹${row.nav.toLocaleString("en-IN")}` : "-"}
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
                      <span style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                        {row.riskScore.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      <span style={{ background: "rgba(248, 81, 73, 0.1)", color: "#f85149", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                        {row.maxDrawdownPct.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", textAlign: "center" }}>
                      <span style={{ background: "rgba(96, 165, 250, 0.15)", border: "1px solid rgba(96, 165, 250, 0.3)", color: "#60a5fa", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
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
    </div>
  );
}

