import { useState, FormEvent } from "react";
import { OptionsAPI } from "../services/api";

interface ChainRow {
  strike: number;
  call?: { lastPrice: number; oi: number };
  put?: { lastPrice: number; oi: number };
}

function fmt(n: number | undefined) {
  if (n === undefined) return "—";
  return n.toLocaleString("en-IN");
}

export default function OptionsChain() {
  const [underlying, setUnderlying] = useState("NIFTY");
  const [expiry, setExpiry] = useState("");
  const [chain, setChain] = useState<ChainRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadChain(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await OptionsAPI.chain(underlying, expiry);
      setChain(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Failed to load option chain");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "9px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
    borderRadius: "var(--radius)", color: "var(--text-primary)", fontSize: 13,
    fontFamily: "var(--font)", outline: "none", transition: "border-color 0.15s",
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>Options Chain</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Virtual F&O — synthesized chain view from broker data</div>
      </div>

      {/* Form */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 22px", marginBottom: 20 }}>
        <form onSubmit={loadChain} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Underlying</label>
            <input
              value={underlying}
              onChange={(e) => setUnderlying(e.target.value.toUpperCase())}
              placeholder="e.g. NIFTY"
              style={{ ...inputStyle, width: 160 }}
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border-light)")}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Expiry Date</label>
            <input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              required
              style={{ ...inputStyle, width: 180, colorScheme: "dark" }}
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border-light)")}
            />
          </div>
          <button type="submit" disabled={loading} style={{
            padding: "9px 24px", borderRadius: "var(--radius)", border: "none",
            background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13,
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            transition: "opacity 0.15s",
          }}>
            {loading ? "Loading…" : "Load Chain"}
          </button>
        </form>
        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius)", color: "var(--red)", fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* Chain table */}
      {chain.length > 0 && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 1fr 1fr", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "Call OI", align: "right", color: "var(--green)" },
              { label: "Call LTP", align: "right", color: "var(--green)" },
              { label: "Strike", align: "center", color: "var(--text-primary)" },
              { label: "Put LTP", align: "left", color: "var(--red)" },
              { label: "Put OI", align: "left", color: "var(--red)" },
            ].map((h) => (
              <div key={h.label} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: h.color, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: h.align as any }}>
                {h.label}
              </div>
            ))}
          </div>

          {chain.map((row, i) => (
            <div key={row.strike} style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 120px 1fr 1fr",
              borderBottom: i < chain.length - 1 ? "1px solid var(--border)" : undefined,
              transition: "background 0.1s",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
            >
              {/* Call OI */}
              <div style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
                {fmt(row.call?.oi)}
              </div>
              {/* Call LTP */}
              <div style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: row.call ? "var(--green)" : "var(--text-muted)" }}>
                {row.call ? row.call.lastPrice.toFixed(2) : "—"}
              </div>
              {/* Strike */}
              <div style={{ padding: "10px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 900, color: "var(--text-primary)", background: "var(--bg-elevated)" }}>
                {row.strike.toLocaleString("en-IN")}
              </div>
              {/* Put LTP */}
              <div style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: row.put ? "var(--red)" : "var(--text-muted)" }}>
                {row.put ? row.put.lastPrice.toFixed(2) : "—"}
              </div>
              {/* Put OI */}
              <div style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
                {fmt(row.put?.oi)}
              </div>
            </div>
          ))}
        </div>
      )}

      {chain.length === 0 && !loading && !error && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          padding: "60px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 14,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⛓️</div>
          Select an underlying and expiry date, then click Load Chain.
        </div>
      )}
    </div>
  );
}
