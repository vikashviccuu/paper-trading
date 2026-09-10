import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PortfolioAPI, OrdersAPI, MarketAPI } from "../services/api";

const TABS = ["Overview", "Positions", "Holdings", "Orders"] as const;
type Tab = (typeof TABS)[number];

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "18px 20px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "var(--font-mono)", letterSpacing: "-0.5px", color: color ?? "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>{msg}</td>
    </tr>
  );
}

export default function Portfolio() {
  const [data, setData] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  function refreshPortfolio() {
    PortfolioAPI.get().then((res) => setData(res.data)).catch(() => {});
    OrdersAPI.list().then((res) => setOrders(res.data)).catch(() => {});
  }

  useEffect(() => {
    refreshPortfolio();
  }, []);

  async function squareOffPosition(p: any) {
    if (!p.instrument?.id) return;
    setActionLoading(true);
    try {
      await OrdersAPI.place({
        instrumentId: p.instrument.id,
        transactionType: p.quantity > 0 ? "SELL" : "BUY",
        orderType: "MARKET",
        productType: p.productType || "INTRADAY",
        quantity: Math.abs(p.quantity),
      });
      setMsg({ text: `✓ Squared off ${p.instrument.tradingSymbol} (${p.quantity > 0 ? "SELL" : "BUY"} ${Math.abs(p.quantity)} Qty)`, ok: true });
      refreshPortfolio();
    } catch (err: any) {
      setMsg({ text: err.response?.data?.error ?? "Square off failed", ok: false });
    } finally {
      setActionLoading(false);
    }
  }

  async function exitHolding(h: any) {
    if (!h.instrument?.id) return;
    setActionLoading(true);
    try {
      await OrdersAPI.place({
        instrumentId: h.instrument.id,
        transactionType: "SELL",
        orderType: "MARKET",
        productType: "DELIVERY",
        quantity: h.quantity,
      });
      setMsg({ text: `✓ Sold holding: ${h.instrument.tradingSymbol} (SELL ${h.quantity} Qty CNC)`, ok: true });
      refreshPortfolio();
    } catch (err: any) {
      setMsg({ text: err.response?.data?.error ?? "Exit holding failed", ok: false });
    } finally {
      setActionLoading(false);
    }
  }

  async function openQuickDemoPosition(query = "RELIANCE") {
    setActionLoading(true);
    try {
      const searchRes = await MarketAPI.search(query);
      const inst = searchRes.data?.[0];
      if (!inst) throw new Error(`Symbol ${query} not found`);

      await OrdersAPI.place({
        instrumentId: inst.id,
        transactionType: "BUY",
        orderType: "MARKET",
        productType: "INTRADAY",
        quantity: 10,
      });
      setMsg({ text: `✓ Opened demo intraday position: BUY 10 ${inst.tradingSymbol}`, ok: true });
      refreshPortfolio();
    } catch (err: any) {
      setMsg({ text: err.response?.data?.error ?? err.message ?? "Demo trade failed", ok: false });
    } finally {
      setActionLoading(false);
    }
  }

  async function openQuickDemoHolding(query = "TCS") {
    setActionLoading(true);
    try {
      const searchRes = await MarketAPI.search(query);
      const inst = searchRes.data?.[0];
      if (!inst) throw new Error(`Symbol ${query} not found`);

      await OrdersAPI.place({
        instrumentId: inst.id,
        transactionType: "BUY",
        orderType: "MARKET",
        productType: "DELIVERY",
        quantity: 5,
      });
      setMsg({ text: `✓ Bought demo holding: BUY 5 ${inst.tradingSymbol} (CNC)`, ok: true });
      refreshPortfolio();
    } catch (err: any) {
      setMsg({ text: err.response?.data?.error ?? err.message ?? "Demo holding failed", ok: false });
    } finally {
      setActionLoading(false);
    }
  }

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "var(--text-muted)", fontSize: 14 }}>
      Loading portfolio…
    </div>
  );

  const { wallet, positions = [], holdings = [], summary } = data;
  const pnl = Number(wallet.realizedPnL || 0);
  const openPositions = positions.filter((p: any) => p.quantity !== 0);
  const closedPositions = positions.filter((p: any) => p.quantity === 0 && Number(p.realizedPnL) !== 0);
  const totalUnrealised = Number(summary?.totalUnrealisedPnL ?? openPositions.reduce((s: number, p: any) => s + Number(p.unrealisedPnL || 0), 0));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>Portfolio</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Virtual wallet, positions, holdings &amp; order history</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => openQuickDemoPosition("RELIANCE")}
            disabled={actionLoading}
            style={{
              background: "linear-gradient(135deg, #4f46e5, #6366f1)", border: "none",
              color: "#fff", padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: actionLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 2px 10px rgba(99, 102, 241, 0.3)"
            }}
          >
            ⚡ Open Demo Position
          </button>
          <Link
            to="/trade"
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
              color: "var(--text-primary)", padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700,
              textDecoration: "none", display: "flex", alignItems: "center", gap: 6
            }}
          >
            🚀 Open Terminal
          </Link>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600,
          background: msg.ok ? "rgba(74, 222, 128, 0.12)" : "rgba(248, 113, 113, 0.12)",
          border: msg.ok ? "1px solid rgba(74, 222, 128, 0.3)" : "1px solid rgba(248, 113, 113, 0.3)",
          color: msg.ok ? "#4ade80" : "#f87171", display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Cash Balance" value={`₹${Number(wallet.cashBalance).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} />
        <StatCard label="Margin Used" value={`₹${Number(wallet.marginUsed).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} color="var(--yellow)" />
        <StatCard label="Realized P&L" value={`${pnl >= 0 ? "+" : ""}₹${pnl.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} color={pnl >= 0 ? "var(--green)" : "var(--red)"} />
        <StatCard label="Unrealised P&L" value={`${totalUnrealised >= 0 ? "+" : ""}₹${totalUnrealised.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} color={totalUnrealised >= 0 ? "var(--green)" : "var(--red)"} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 4, width: "fit-content" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "7px 18px", borderRadius: "var(--radius)", border: "none", cursor: "pointer",
            background: tab === t ? "var(--bg-active)" : "transparent",
            color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: tab === t ? 700 : 500, fontSize: 13, transition: "all 0.15s",
          }}>{t}</button>
        ))}
      </div>

      {/* Table panel */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        {(tab === "Overview" || tab === "Positions") && (
          <>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Open Positions — Intraday / F&amp;O ({openPositions.length})
              </div>
              {openPositions.length === 0 && (
                <button
                  onClick={() => openQuickDemoPosition("RELIANCE")}
                  style={{ background: "rgba(99, 102, 241, 0.15)", border: "1px solid rgba(99, 102, 241, 0.35)", color: "#818cf8", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  ⚡ Open Demo Position
                </button>
              )}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  {["Symbol", "Product", "Qty", "Avg Price", "LTP", "Unrealised P&L", "Action"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openPositions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "36px 16px" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
                        No open positions currently active
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
                        Place an Intraday (MIS) or F&amp;O (NRML) order to test live market data and floating P&amp;L.
                      </div>
                      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                        <button
                          onClick={() => openQuickDemoPosition("RELIANCE")}
                          style={{
                            background: "linear-gradient(135deg, #4f46e5, #6366f1)", border: "none",
                            color: "#fff", padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer"
                          }}
                        >
                          ⚡ Buy RELIANCE (10 Qty MIS)
                        </button>
                        <button
                          onClick={() => openQuickDemoPosition("NIFTY 50")}
                          style={{
                            background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
                            color: "var(--text-primary)", padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer"
                          }}
                        >
                          ⚡ Buy NIFTY 50 (1 Qty MIS)
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : openPositions.map((p: any) => {
                  const uPnl = Number(p.unrealisedPnL ?? (p.quantity * (Number(p.ltp || p.avgPrice) - Number(p.avgPrice))));
                  const isProfit = uPnl >= 0;
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "11px 16px", fontWeight: 700, fontSize: 13 }}>{p.instrument?.tradingSymbol}</td>
                      <td style={{ padding: "11px 16px" }}><span style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>{p.productType}</span></td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>{p.quantity}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>₹{Number(p.avgPrice).toFixed(2)}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>₹{Number(p.ltp || p.avgPrice).toFixed(2)}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: isProfit ? "var(--green)" : "var(--red)" }}>
                        {isProfit ? "+" : ""}₹{uPnl.toFixed(2)}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <button
                          onClick={() => squareOffPosition(p)}
                          disabled={actionLoading}
                          style={{
                            background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)",
                            color: "#f87171", borderRadius: 4, padding: "3px 10px", fontSize: 11,
                            fontWeight: 700, cursor: actionLoading ? "not-allowed" : "pointer"
                          }}
                        >
                          Square Off
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Closed Positions Section */}
            {closedPositions.length > 0 && (
              <>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.01)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Closed Positions — Realized Today ({closedPositions.length})
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "var(--font-mono)", color: pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                    Total Realized: {pnl >= 0 ? "+" : ""}₹{pnl.toFixed(2)}
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-elevated)" }}>
                      {["Symbol", "Product", "Status", "Entry Price", "Realized P&L"].map((h) => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map((p: any) => {
                      const rPnl = Number(p.realizedPnL || 0);
                      const isProfit = rPnl >= 0;
                      return (
                        <tr key={`closed-${p.id}`} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "11px 16px", fontWeight: 700, fontSize: 13 }}>{p.instrument?.tradingSymbol}</td>
                          <td style={{ padding: "11px 16px" }}><span style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>{p.productType}</span></td>
                          <td style={{ padding: "11px 16px" }}><span style={{ color: "#a5b4fc", fontSize: 11, fontWeight: 700 }}>Squared Off</span></td>
                          <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>₹{Number(p.avgPrice).toFixed(2)}</td>
                          <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: isProfit ? "var(--green)" : "var(--red)" }}>
                            {isProfit ? "+" : ""}₹{rPnl.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {(tab === "Overview" || tab === "Holdings") && (
          <>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", borderTop: tab === "Overview" ? "1px solid var(--border)" : undefined, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Holdings — Delivery CNC ({holdings.length})
              </div>
              {holdings.length === 0 && (
                <button
                  onClick={() => openQuickDemoHolding("TCS")}
                  style={{ background: "rgba(99, 102, 241, 0.15)", border: "1px solid rgba(99, 102, 241, 0.35)", color: "#818cf8", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  ⚡ Buy Demo Holding
                </button>
              )}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  {["Symbol", "Qty", "Avg Buy Price", "LTP", "Current Value", "P&L", "Action"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "32px 16px" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
                        No delivery holdings yet
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                        Place a Delivery (CNC) BUY order to build your equity stock holdings.
                      </div>
                      <button
                        onClick={() => openQuickDemoHolding("TCS")}
                        style={{
                          background: "linear-gradient(135deg, #4f46e5, #6366f1)", border: "none",
                          color: "#fff", padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer"
                        }}
                      >
                        ⚡ Buy 5 TCS (Delivery CNC)
                      </button>
                    </td>
                  </tr>
                ) : holdings.map((h: any) => {
                  const curVal = Number(h.currentValue ?? (h.quantity * Number(h.ltp || h.avgPrice)));
                  const inv = Number(h.invested ?? (h.quantity * Number(h.avgPrice)));
                  const hPnl = Number(h.unrealisedPnL ?? (curVal - inv));
                  const isProfit = hPnl >= 0;
                  return (
                    <tr key={h.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "11px 16px", fontWeight: 700, fontSize: 13 }}>{h.instrument?.tradingSymbol}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>{h.quantity}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>₹{Number(h.avgPrice).toFixed(2)}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>₹{Number(h.ltp || h.avgPrice).toFixed(2)}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>₹{curVal.toFixed(2)}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: isProfit ? "var(--green)" : "var(--red)" }}>
                        {isProfit ? "+" : ""}₹{hPnl.toFixed(2)}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <button
                          onClick={() => exitHolding(h)}
                          disabled={actionLoading}
                          style={{
                            background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.35)",
                            color: "#f87171", borderRadius: 4, padding: "3px 10px", fontSize: 11,
                            fontWeight: 700, cursor: actionLoading ? "not-allowed" : "pointer"
                          }}
                        >
                          Exit / Sell
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {(tab === "Overview" || tab === "Orders") && (
          <>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", borderTop: tab === "Overview" ? "1px solid var(--border)" : undefined, fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Order History
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  {["Symbol", "Side", "Type", "Qty", "Filled Price", "Status"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? <EmptyRow cols={6} msg="No orders yet" /> : orders.slice(0, 25).map((o: any) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "11px 16px", fontWeight: 700, fontSize: 13 }}>{o.instrument?.tradingSymbol ?? "—"}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{
                        background: o.transactionType === "BUY" ? "rgba(74, 222, 128, 0.12)" : "rgba(248, 113, 113, 0.12)",
                        color: o.transactionType === "BUY" ? "#4ade80" : "#f87171",
                        border: `1px solid ${o.transactionType === "BUY" ? "rgba(74, 222, 128, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
                        borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700,
                      }}>{o.transactionType}</span>
                    </td>
                    <td style={{ padding: "11px 16px", color: "var(--text-muted)", fontSize: 12 }}>{o.productType} · {o.orderType}</td>
                    <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>{o.quantity}</td>
                    <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>{o.filledPrice ? `₹${Number(o.filledPrice).toFixed(2)}` : "—"}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{
                        color: o.status === "COMPLETE" ? "#4ade80" : o.status === "REJECTED" ? "#f87171" : "#eab308",
                        fontWeight: 700, fontSize: 12,
                      }}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
