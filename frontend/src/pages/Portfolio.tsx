import { useEffect, useState } from "react";
import { PortfolioAPI, OrdersAPI } from "../services/api";

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

  useEffect(() => {
    PortfolioAPI.get().then((res) => setData(res.data));
    OrdersAPI.list().then((res) => setOrders(res.data));
  }, []);

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
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>Portfolio</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Virtual wallet, positions, holdings & order history</div>
      </div>

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
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  {["Symbol", "Product", "Qty", "Avg Price", "LTP", "Unrealised P&L"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openPositions.length === 0 ? <EmptyRow cols={6} msg="No open positions" /> : openPositions.map((p: any) => {
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
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", borderTop: tab === "Overview" ? "1px solid var(--border)" : undefined, fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Holdings — Delivery CNC ({holdings.length})
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  {["Symbol", "Qty", "Avg Buy Price", "LTP", "Current Value", "P&L"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.length === 0 ? <EmptyRow cols={6} msg="No holdings" /> : holdings.map((h: any) => {
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
                {orders.length === 0 ? <EmptyRow cols={6} msg="No orders yet" /> : orders.map((o: any) => {
                  const isBuy = o.transactionType === "BUY";
                  const isDone = o.status === "COMPLETE";
                  return (
                    <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "11px 16px", fontWeight: 700, fontSize: 13 }}>{o.instrument.tradingSymbol}</td>
                      <td style={{ padding: "11px 16px" }}>
                        <span style={{ background: isBuy ? "var(--green-bg)" : "var(--red-bg)", color: isBuy ? "var(--green)" : "var(--red)", border: `1px solid ${isBuy ? "var(--green-border)" : "var(--red-border)"}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{o.transactionType}</span>
                      </td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: "var(--text-secondary)" }}>{o.orderType}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>{o.quantity}</td>
                      <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", fontSize: 13 }}>{o.filledPrice ? `₹${Number(o.filledPrice).toFixed(2)}` : "—"}</td>
                      <td style={{ padding: "11px 16px" }}>
                        <span style={{ background: isDone ? "var(--green-bg)" : "var(--bg-elevated)", color: isDone ? "var(--green)" : "var(--text-muted)", border: `1px solid ${isDone ? "var(--green-border)" : "var(--border)"}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{o.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
