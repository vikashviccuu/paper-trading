import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Watchlist from "../components/Watchlist";
import { Instrument } from "../services/api";

export default function Dashboard() {
  const [selected, setSelected] = useState<Instrument | null>(null);
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
          Dashboard
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          Virtual paper trading — zero real money, real market data
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Virtual Balance", value: "₹10,00,000", sub: "Starting cash", color: "var(--text-primary)" },
          { label: "Open Positions", value: "0", sub: "Intraday / F&O", color: "var(--text-secondary)" },
          { label: "Today's P&L", value: "₹0.00", sub: "Unrealized", color: "var(--green)" },
        ].map((s) => (
          <div key={s.label} style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "18px 20px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: "var(--font-mono)", letterSpacing: "-0.5px" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        {/* Left: info + selected */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "20px 22px",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>Getting Started</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              Search a symbol in the watchlist, select it, then click <strong style={{ color: "var(--text-primary)" }}>Trade</strong> to place a virtual order.
              Live prices stream over WebSocket from the configured broker adapter (<code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)" }}>BROKER_PROVIDER</code> in backend .env).
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => navigate("/trade")} style={{
                padding: "8px 18px", borderRadius: "var(--radius)", border: "none",
                background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}>Open Terminal</button>
              <button onClick={() => navigate("/contests")} style={{
                padding: "8px 18px", borderRadius: "var(--radius)", border: "1px solid var(--border-light)",
                background: "transparent", color: "var(--text-secondary)", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>Browse Contests</button>
            </div>
          </div>

          {selected && (
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-lg)",
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Selected</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{selected.tradingSymbol}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{selected.segment}</div>
              </div>
              <button onClick={() => navigate("/trade", { state: selected })} style={{
                padding: "10px 22px", borderRadius: "var(--radius)", border: "none",
                background: "var(--green)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
                boxShadow: "0 2px 12px #3fb95033",
              }}>Trade →</button>
            </div>
          )}

          {/* Quick links */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { icon: "📊", title: "Portfolio", desc: "Positions, holdings & P&L", path: "/portfolio" },
              { icon: "🏆", title: "Contests", desc: "Risk-adjusted leaderboards", path: "/contests" },
              { icon: "⛓️", title: "Options Chain", desc: "Virtual F&O chain view", path: "/options" },
              { icon: "📈", title: "Live Trading", desc: "Link your broker account", path: "/live-trading" },
            ].map((q) => (
              <div key={q.path} onClick={() => navigate(q.path)} style={{
                background: "var(--bg-surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)", padding: "16px 18px", cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-light)"; (e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLDivElement).style.background = "var(--bg-surface)"; }}
              >
                <div style={{ fontSize: 22, marginBottom: 8 }}>{q.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{q.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{q.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Watchlist */}
        <Watchlist onSelect={setSelected} />
      </div>
    </div>
  );
}
