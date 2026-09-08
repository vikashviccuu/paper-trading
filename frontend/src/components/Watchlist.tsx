import { useEffect, useState } from "react";
import { Instrument, MarketAPI } from "../services/api";
import { getSocket, Tick } from "../services/socket";

interface Props {
  onSelect: (instrument: Instrument) => void;
}

export default function Watchlist({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    MarketAPI.search("").then((res) => setResults(res.data));
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      MarketAPI.search(query).then((res) => setResults(res.data));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const socket = getSocket();
    const tokens = results.map((r) => r.instrumentToken);
    if (tokens.length) socket.emit("subscribe", tokens);
    const onTick = (tick: Tick) => {
      setPrices((prev) => ({ ...prev, [tick.instrumentToken]: tick.lastPrice }));
    };
    socket.on("tick", onTick);
    return () => {
      socket.off("tick", onTick);
      if (tokens.length) socket.emit("unsubscribe", tokens);
    };
  }, [results]);

  function handleSelect(r: Instrument) {
    setSelected(r.instrumentToken);
    onSelect(r);
  }

  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Watchlist</div>
        <input
          placeholder="Search symbol…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%", padding: "8px 10px 8px 32px",
            background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
            borderRadius: "var(--radius)", color: "var(--text-primary)", fontSize: 13,
            fontFamily: "var(--font)", outline: "none",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat", backgroundPosition: "10px center",
          }}
          onFocus={e => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-glow)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--border-light)"; e.target.style.boxShadow = "none"; }}
        />
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {results.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No symbols found</div>
        )}
        {results.map((r) => {
          const price = prices[r.instrumentToken] ?? r.lastPrice;
          const isSelected = selected === r.instrumentToken;
          return (
            <div key={r.id} onClick={() => handleSelect(r)} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 16px", cursor: "pointer",
              borderBottom: "1px solid var(--border)",
              background: isSelected ? "var(--bg-active)" : "transparent",
              transition: "background 0.1s",
            }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{r.tradingSymbol}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{r.segment}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: price ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {price ? `₹${Number(price).toLocaleString("en-IN")}` : "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
