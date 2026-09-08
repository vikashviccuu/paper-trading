import { useEffect, useState } from "react";
import { AdminLiveTradingAPI, AdminLiveTradingAccount, AdminLiveOrder } from "../../services/adminApi";

const STATUS_BADGE: Record<string, { label: string; bg: string; border: string; color: string }> = {
  NOT_ELIGIBLE: { label: "NOT ELIGIBLE", bg: "rgba(139, 148, 158, 0.12)", border: "rgba(139, 148, 158, 0.25)", color: "#8b949e" },
  ELIGIBLE: { label: "ELIGIBLE", bg: "rgba(210, 153, 34, 0.15)", border: "rgba(210, 153, 34, 0.35)", color: "#d29922" },
  ENABLED: { label: "LIVE ENABLED", bg: "rgba(63, 185, 80, 0.15)", border: "rgba(63, 185, 80, 0.35)", color: "#3fb950" },
  SUSPENDED: { label: "SUSPENDED", bg: "rgba(248, 81, 73, 0.15)", border: "rgba(248, 81, 73, 0.35)", color: "#f85149" },
};

const BROKER_COLOR: Record<string, { bg: string; color: string }> = {
  ZERODHA: { bg: "rgba(235, 91, 45, 0.15)", color: "#ff6b35" },
  UPSTOX: { bg: "rgba(102, 51, 153, 0.2)", color: "#a855f7" },
  ANGELONE: { bg: "rgba(0, 102, 204, 0.2)", color: "#60a5fa" },
  ICICIDIRECT: { bg: "rgba(242, 101, 34, 0.2)", color: "#f97316" },
  MOCK: { bg: "rgba(139, 148, 158, 0.15)", color: "#8b949e" },
};

export default function AdminLiveTrading() {
  const [accounts, setAccounts] = useState<AdminLiveTradingAccount[]>([]);
  const [selected, setSelected] = useState<AdminLiveTradingAccount | null>(null);
  const [orders, setOrders] = useState<AdminLiveOrder[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterTab, setFilterTab] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  function load() {
    AdminLiveTradingAPI.listAccounts().then((res) => setAccounts(res.data));
  }

  useEffect(load, []);

  function viewAudit(account: AdminLiveTradingAccount) {
    setSelected(account);
    AdminLiveTradingAPI.orderAudit(account.user.id).then((res) => setOrders(res.data));
  }

  async function suspend(userId: string) {
    if (!reason.trim()) {
      setMessage({ text: "Please enter a suspension reason.", type: "error" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await AdminLiveTradingAPI.suspend(userId, reason);
      setMessage({ text: "Account successfully suspended.", type: "success" });
      setReason("");
      load();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.error ?? "Could not suspend account", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function reinstate(userId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await AdminLiveTradingAPI.reinstate(userId);
      setMessage({ text: "Account reinstated to ELIGIBLE status.", type: "success" });
      load();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.error ?? "Could not reinstate account", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function grantEligibility(userId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await AdminLiveTradingAPI.grantEligibility(userId);
      setMessage({ text: "Live trading eligibility granted to user.", type: "success" });
      load();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.error ?? "Could not grant eligibility", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  const filteredAccounts = accounts.filter((a) => {
    const matchesTab = filterTab === "ALL" || a.status === filterTab;
    const matchesSearch =
      a.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.brokerLink?.provider ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const totalEnabled = accounts.filter((a) => a.status === "ENABLED").length;
  const totalEligible = accounts.filter((a) => a.status === "ELIGIBLE").length;
  const totalSuspended = accounts.filter((a) => a.status === "SUSPENDED").length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 0 40px" }}>
      {/* Header Banner Card */}
      <div style={{
        background: "rgba(13, 17, 28, 0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 16,
        padding: "24px 28px",
        marginBottom: 24,
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 20
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
              Live Trading Oversight
            </h2>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(63, 185, 80, 0.12)", border: "1px solid rgba(63, 185, 80, 0.3)",
              padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: "#3fb950"
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fb950", animation: "blink 1.4s infinite" }} />
              SELF-CUSTODY AUDIT
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 640, lineHeight: 1.5 }}>
            Real-money accounts across the platform. Orders execute directly on each user's linked broker via their own credentials with 2FA & risk controls.
          </p>
        </div>

        {/* Quick Stat Cards */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-light)", borderRadius: 12, padding: "10px 16px", minWidth: 110 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>TOTAL</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{accounts.length}</div>
          </div>
          <div style={{ background: "rgba(63, 185, 80, 0.08)", border: "1px solid rgba(63, 185, 80, 0.2)", borderRadius: 12, padding: "10px 16px", minWidth: 110 }}>
            <div style={{ fontSize: 11, color: "#3fb950", fontWeight: 600 }}>ENABLED</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#3fb950", fontFamily: "var(--font-mono)" }}>{totalEnabled}</div>
          </div>
          <div style={{ background: "rgba(210, 153, 34, 0.08)", border: "1px solid rgba(210, 153, 34, 0.2)", borderRadius: 12, padding: "10px 16px", minWidth: 110 }}>
            <div style={{ fontSize: 11, color: "#d29922", fontWeight: 600 }}>ELIGIBLE</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#d29922", fontFamily: "var(--font-mono)" }}>{totalEligible}</div>
          </div>
          <div style={{ background: "rgba(248, 81, 73, 0.08)", border: "1px solid rgba(248, 81, 73, 0.2)", borderRadius: 12, padding: "10px 16px", minWidth: 110 }}>
            <div style={{ fontSize: 11, color: "#f85149", fontWeight: 600 }}>SUSPENDED</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#f85149", fontFamily: "var(--font-mono)" }}>{totalSuspended}</div>
          </div>
        </div>
      </div>

      {/* Global Alert Message */}
      {message && (
        <div style={{
          background: message.type === "success" ? "rgba(63, 185, 80, 0.12)" : "rgba(248, 81, 73, 0.12)",
          border: `1px solid ${message.type === "success" ? "rgba(63, 185, 80, 0.3)" : "rgba(248, 81, 73, 0.3)"}`,
          color: message.type === "success" ? "#3fb950" : "#f85149",
          borderRadius: 12, padding: "12px 18px", marginBottom: 20, fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 10
        }}>
          <span>{message.type === "success" ? "✓" : "⚠"}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Main Grid */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1.4fr 1fr" : "1fr", gap: 24 }}>
        {/* Accounts List Card */}
        <div style={{
          background: "rgba(13, 17, 28, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)"
        }}>
          {/* Controls Bar: Filter Tabs + Search Input */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            {/* Status Filter Tabs */}
            <div style={{ display: "flex", gap: 4, background: "rgba(255, 255, 255, 0.03)", padding: 4, borderRadius: 10, border: "1px solid var(--border-light)" }}>
              {["ALL", "ENABLED", "ELIGIBLE", "SUSPENDED", "NOT_ELIGIBLE"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  style={{
                    padding: "6px 12px", borderRadius: 7, border: "none",
                    background: filterTab === tab ? "var(--accent)" : "transparent",
                    color: filterTab === tab ? "#fff" : "var(--text-secondary)",
                    fontSize: 12, fontWeight: 600, transition: "all 0.15s"
                  }}
                >
                  {tab.replace("_", " ")}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <input
              placeholder="Search user or broker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "8px 14px", background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid var(--border-light)", borderRadius: 8,
                color: "var(--text-primary)", fontSize: 13, outline: "none", width: 220
              }}
            />
          </div>

          {/* Accounts Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>User</th>
                  <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Broker</th>
                  <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Risk Limits</th>
                  <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((a) => {
                  const badge = STATUS_BADGE[a.status] ?? STATUS_BADGE.NOT_ELIGIBLE;
                  const isSelected = selected?.id === a.id;
                  const brokerName = a.brokerLink?.provider ?? "-";
                  const brokerStyle = BROKER_COLOR[brokerName] ?? { bg: "rgba(255, 255, 255, 0.05)", color: "var(--text-secondary)" };

                  return (
                    <tr
                      key={a.id}
                      style={{
                        borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                        background: isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                        transition: "background 0.15s"
                      }}
                    >
                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: 12, color: "#fff", flexShrink: 0
                          }}>
                            {a.user.name?.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{a.user.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.user.email}</div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "12px" }}>
                        <span style={{
                          display: "inline-block", padding: "3px 9px", borderRadius: 6,
                          fontSize: 10, fontWeight: 800, letterSpacing: "0.03em",
                          background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color
                        }}>
                          {badge.label}
                        </span>
                      </td>

                      <td style={{ padding: "12px" }}>
                        {a.brokerLink ? (
                          <span style={{
                            padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                            background: brokerStyle.bg, color: brokerStyle.color, fontFamily: "var(--font-mono)"
                          }}>
                            {a.brokerLink.provider}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Unlinked</span>
                        )}
                      </td>

                      <td style={{ padding: "12px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                        <div>{a.dailyOrderLimit} orders/day</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Max: ₹{Number(a.maxOrderValue).toLocaleString("en-IN")}</div>
                      </td>

                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button
                            onClick={() => viewAudit(a)}
                            style={{
                              padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border-light)",
                              background: isSelected ? "var(--accent)" : "rgba(255, 255, 255, 0.04)",
                              color: isSelected ? "#fff" : "var(--text-primary)", fontSize: 11, fontWeight: 600
                            }}
                          >
                            Audit
                          </button>

                          {a.status === "NOT_ELIGIBLE" && (
                            <button
                              onClick={() => grantEligibility(a.user.id)}
                              disabled={busy}
                              style={{
                                padding: "5px 10px", borderRadius: 6, border: "none",
                                background: "rgba(63, 185, 80, 0.2)", color: "#3fb950", fontSize: 11, fontWeight: 700
                              }}
                            >
                              Grant Eligibility
                            </button>
                          )}

                          {a.status === "SUSPENDED" ? (
                            <button
                              onClick={() => reinstate(a.user.id)}
                              disabled={busy}
                              style={{
                                padding: "5px 10px", borderRadius: 6, border: "none",
                                background: "linear-gradient(135deg, #059669, #10b981)", color: "#fff", fontSize: 11, fontWeight: 700
                              }}
                            >
                              Reinstate
                            </button>
                          ) : (
                            <button
                              onClick={() => setSelected(a)}
                              disabled={busy}
                              style={{
                                padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(248, 81, 73, 0.3)",
                                background: "rgba(248, 81, 73, 0.1)", color: "#f85149", fontSize: 11, fontWeight: 600
                              }}
                            >
                              Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredAccounts.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                      No live trading accounts match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Account Audit Drawer / Details */}
        {selected && (
          <div style={{
            background: "rgba(13, 17, 28, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(37, 99, 235, 0.25)",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 25px 50px rgba(0, 0, 0, 0.5)",
            height: "fit-content"
          }}>
            {/* Header / Close button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)" }}>{selected.user.name}</h3>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{selected.user.email}</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: "none", border: "none", color: "var(--text-muted)",
                  fontSize: 18, cursor: "pointer", padding: "2px 6px"
                }}
              >
                ✕
              </button>
            </div>

            {/* Suspension Control Section */}
            {selected.status !== "SUSPENDED" && (
              <div style={{
                background: "rgba(248, 81, 73, 0.06)", border: "1px solid rgba(248, 81, 73, 0.2)",
                borderRadius: 12, padding: 14, marginBottom: 20
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f85149", textTransform: "uppercase", marginBottom: 8 }}>
                  Suspend Account
                </div>
                <input
                  placeholder="Enter reason for suspension..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{
                    width: "100%", padding: "8px 12px", background: "rgba(0, 0, 0, 0.2)",
                    border: "1px solid var(--border-light)", borderRadius: 6,
                    color: "var(--text-primary)", fontSize: 12, outline: "none", marginBottom: 10
                  }}
                />
                <button
                  onClick={() => suspend(selected.user.id)}
                  disabled={busy}
                  style={{
                    width: "100%", padding: "8px", borderRadius: 6, border: "none",
                    background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer"
                  }}
                >
                  Confirm Suspension
                </button>
              </div>
            )}

            {/* Order Audit Trail Title */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Order Audit Trail</div>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{orders.length} orders</span>
            </div>

            {/* Orders Table */}
            <div style={{ overflowY: "auto", maxHeight: 420 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "8px 6px", color: "var(--text-muted)", fontSize: 10 }}>Symbol</th>
                    <th style={{ padding: "8px 6px", color: "var(--text-muted)", fontSize: 10 }}>Side</th>
                    <th style={{ padding: "8px 6px", color: "var(--text-muted)", fontSize: 10 }}>Qty</th>
                    <th style={{ padding: "8px 6px", color: "var(--text-muted)", fontSize: 10 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <td style={{ padding: "8px 6px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {o.tradingSymbol}
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{o.exchange || o.broker}</div>
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <span style={{
                          padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 800,
                          background: o.transactionType === "BUY" ? "rgba(63, 185, 80, 0.15)" : "rgba(248, 81, 73, 0.15)",
                          color: o.transactionType === "BUY" ? "#3fb950" : "#f85149"
                        }}>
                          {o.transactionType}
                        </span>
                      </td>
                      <td style={{ padding: "8px 6px", fontFamily: "var(--font-mono)" }}>{o.quantity}</td>
                      <td style={{ padding: "8px 6px" }}>
                        <div style={{ fontWeight: 600, color: o.status === "COMPLETE" ? "#3fb950" : o.status === "REJECTED" ? "#f85149" : "#60a5fa" }}>
                          {o.status}
                        </div>
                        {o.events && o.events.length > 0 && (
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                            {o.events.length} event(s) logged
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}

                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                        No audit records found for this user.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
