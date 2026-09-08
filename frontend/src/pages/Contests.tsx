import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Contest, ContestsAPI } from "../services/api";

const STATUS_TABS: Array<Contest["status"] | "ALL"> = ["ALL", "UPCOMING", "ACTIVE", "ENDED"];

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  ACTIVE:   { bg: "var(--green-bg)",  color: "var(--green)",  border: "var(--green-border)" },
  UPCOMING: { bg: "#1e3a5f",          color: "#60a5fa",       border: "#1d4ed8" },
  ENDED:    { bg: "var(--bg-elevated)", color: "var(--text-muted)", border: "var(--border)" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.ENDED;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
      {status === "ACTIVE" && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--green)", marginRight: 5, verticalAlign: "middle", animation: "blink 1.4s infinite" }} />}
      {status}
    </span>
  );
}

export default function Contests() {
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("ACTIVE");
  const [contests, setContests] = useState<Contest[]>([]);

  useEffect(() => {
    ContestsAPI.list(tab === "ALL" ? undefined : tab).then((res) => setContests(res.data));
  }, [tab]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>Contests</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, maxWidth: 520 }}>
            Trade with an isolated virtual portfolio. Ranking blends return + risk — not raw P&L.{" "}
            <Link to="/admin/login" style={{ color: "var(--accent)" }}>Admin panel →</Link>
          </div>
        </div>
        {/* Tab pills */}
        <div style={{ display: "flex", gap: 4, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 4 }}>
          {STATUS_TABS.map((s) => (
            <button key={s} onClick={() => setTab(s)} style={{
              padding: "6px 16px", borderRadius: "var(--radius)", border: "none", cursor: "pointer",
              background: tab === s ? "var(--bg-active)" : "transparent",
              color: tab === s ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: tab === s ? 700 : 500, fontSize: 12, transition: "all 0.15s",
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Contest cards */}
      {contests.length === 0 ? (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          padding: "60px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 14,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏆</div>
          No contests in this category yet.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {contests.map((c) => {
            const participants = c._count?.participants ?? 0;
            const isFull = c.maxParticipants ? participants >= c.maxParticipants : false;
            const pct = c.maxParticipants ? Math.round((participants / c.maxParticipants) * 100) : null;
            return (
              <div key={c.id} style={{
                background: "var(--bg-surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)", padding: "20px 22px",
                display: "flex", flexDirection: "column", gap: 14,
                transition: "border-color 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-light)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"}
              >
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.3, flex: 1, marginRight: 10 }}>{c.name}</div>
                  <StatusBadge status={c.status} />
                </div>

                {/* Meta grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Starting Cash", value: `₹${Number(c.startingVirtualCash).toLocaleString("en-IN")}` },
                    { label: "Participants", value: `${participants}${c.maxParticipants ? ` / ${c.maxParticipants}` : ""}` },
                    { label: "Starts", value: new Date(c.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
                    { label: "Ends", value: new Date(c.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
                  ].map((m) => (
                    <div key={m.label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Capacity bar */}
                {pct !== null && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                      <span>Capacity</span><span>{pct}%</span>
                    </div>
                    <div style={{ height: 3, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: isFull ? "var(--red)" : "var(--accent)", borderRadius: 99, transition: "width 0.4s" }} />
                    </div>
                  </div>
                )}

                {/* CTA */}
                <Link to={`/contests/${c.id}`} style={{
                  display: "block", textAlign: "center", padding: "9px 0",
                  borderRadius: "var(--radius)", border: "1px solid var(--border-light)",
                  background: "var(--bg-elevated)", color: "var(--text-primary)",
                  fontWeight: 700, fontSize: 13, transition: "all 0.15s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--bg-hover)"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLAnchorElement).style.color = "#60a5fa"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border-light)"; (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-primary)"; }}
                >
                  View Contest →
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
