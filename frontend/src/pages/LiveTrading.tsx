import { useEffect, useState } from "react";
import { LiveTradingAPI, LiveTradingAccount, BrokerLink } from "../services/liveTradingApi";

const BROKERS: BrokerLink["provider"][] = ["ZERODHA", "UPSTOX", "ANGELONE", "ICICIDIRECT", "MOCK"];

const STATUS_META: Record<string, { label: string; icon: string; accent: string; bg: string; border: string; help: string }> = {
  NOT_ELIGIBLE: {
    label: "Not Eligible",
    icon: "🔒",
    accent: "var(--text-muted)",
    bg: "var(--bg-elevated)",
    border: "var(--border)",
    help: "Live trading unlocks when a contest prize is paid out with the \"prop trading\" payout preference (see Profile), or an admin grants it.",
  },
  ELIGIBLE: {
    label: "Eligible — Not Enabled",
    icon: "✅",
    accent: "var(--yellow)",
    bg: "#1a1400",
    border: "#3d2e00",
    help: "You're eligible. Link a real broker account below and opt in to start placing live orders.",
  },
  ENABLED: {
    label: "LIVE — Real Money",
    icon: "⚡",
    accent: "var(--red)",
    bg: "var(--red-bg)",
    border: "var(--red-border)",
    help: "Orders placed in the terminal's Live account mode execute for real on your linked broker account.",
  },
  SUSPENDED: {
    label: "Suspended",
    icon: "🚫",
    accent: "var(--red)",
    bg: "var(--red-bg)",
    border: "var(--red-border)",
    help: "An admin has suspended live trading on your account.",
  },
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
  borderRadius: "var(--radius)", color: "var(--text-primary)", fontSize: 13,
  fontFamily: "var(--font)", outline: "none", width: "100%",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 28,
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</label>
      {children}
    </div>
  );
}

export default function LiveTrading() {
  const [account, setAccount] = useState<LiveTradingAccount | null>(null);
  const [brokers, setBrokers] = useState<BrokerLink[]>([]);
  const [provider, setProvider] = useState<BrokerLink["provider"]>("ZERODHA");
  const [accessToken, setAccessToken] = useState("");
  const [nickname, setNickname] = useState("");
  const [selectedBrokerId, setSelectedBrokerId] = useState("");
  const [dailyOrderLimit, setDailyOrderLimit] = useState(50);
  const [maxOrderValue, setMaxOrderValue] = useState(50000);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    LiveTradingAPI.getAccount().then((res) => {
      setAccount(res.data);
      setDailyOrderLimit(res.data.dailyOrderLimit);
      setMaxOrderValue(Number(res.data.maxOrderValue));
    });
    LiveTradingAPI.listBrokers().then((res) => setBrokers(res.data));
  }

  useEffect(load, []);

  function msg(text: string, ok = true) { setMessage({ text, ok }); }

  async function linkBroker() {
    setBusy(true); setMessage(null);
    try {
      await LiveTradingAPI.linkBroker({ provider, accessToken, nickname: nickname || undefined });
      setAccessToken(""); setNickname("");
      msg("Broker linked successfully.");
      load();
    } catch (err: any) { msg(err.response?.data?.error ?? "Could not link broker", false); }
    finally { setBusy(false); }
  }

  async function unlinkBroker(id: string) {
    if (!confirm("Unlink this broker?")) return;
    setBusy(true); setMessage(null);
    try { await LiveTradingAPI.unlinkBroker(id); load(); }
    catch (err: any) { msg(err.response?.data?.error ?? "Could not unlink broker", false); }
    finally { setBusy(false); }
  }

  async function enable() {
    if (!selectedBrokerId) { msg("Pick a linked broker first.", false); return; }
    if (!confirm("This enables LIVE trading with real money via your linked broker account. Continue?")) return;
    setBusy(true); setMessage(null);
    try { await LiveTradingAPI.enable(selectedBrokerId); msg("Live trading enabled."); load(); }
    catch (err: any) { msg(err.response?.data?.error ?? "Could not enable live trading", false); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage(null);
    try { await LiveTradingAPI.disable(); msg("Live trading disabled."); load(); }
    catch (err: any) { msg(err.response?.data?.error ?? "Could not disable", false); }
    finally { setBusy(false); }
  }

  async function toggleKillSwitch(active: boolean) {
    setBusy(true); setMessage(null);
    try { await LiveTradingAPI.setKillSwitch(active); load(); }
    catch (err: any) { msg(err.response?.data?.error ?? "Could not update kill switch", false); }
    finally { setBusy(false); }
  }

  async function saveRiskLimits() {
    setBusy(true); setMessage(null);
    try { await LiveTradingAPI.updateRiskLimits(dailyOrderLimit, maxOrderValue); msg("Risk limits saved."); load(); }
    catch (err: any) { msg(err.response?.data?.error ?? "Could not save risk limits", false); }
    finally { setBusy(false); }
  }

  if (!account) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "var(--text-muted)", fontSize: 14 }}>
      Loading…
    </div>
  );

  const meta = STATUS_META[account.status] ?? STATUS_META.NOT_ELIGIBLE;
  const isEnabled = account.status === "ENABLED";
  const isEligible = account.status === "ELIGIBLE";

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>Live Trading</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          Real orders on your own broker account — platform never holds your funds.
        </div>
      </div>

      {/* Deployment disabled banner */}
      {!account.liveTradingEnabledOnDeployment && (
        <div style={{
          background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-lg)",
          padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <div style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}>
            Live trading is disabled on this deployment (<code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>LIVE_TRADING_ENABLED=false</code>). Order placement will be rejected even if your account is ENABLED.
          </div>
        </div>
      )}

      {/* Status banner */}
      <div style={{
        background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: "var(--radius-lg)",
        padding: "18px 22px", marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>{meta.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: meta.accent }}>{meta.label}</span>
          {isEnabled && (
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 4, padding: "2px 8px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", display: "inline-block", animation: "blink 1.4s infinite" }} />
              LIVE
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{meta.help}</div>
        {account.status === "SUSPENDED" && account.suspendedReason && (
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--red)", fontWeight: 600 }}>Reason: {account.suspendedReason}</div>
        )}
      </div>

      {/* Kill switch alert */}
      {isEnabled && account.killSwitchActive && (
        <div style={{
          background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-lg)",
          padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ fontSize: 13, color: "var(--red)", fontWeight: 700 }}>
            🛑 Kill switch active — no new live orders can be placed.
          </div>
          <button onClick={() => toggleKillSwitch(false)} disabled={busy} style={{
            padding: "7px 16px", borderRadius: "var(--radius)", border: "1px solid var(--red-border)",
            background: "transparent", color: "var(--red)", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
          }}>Resume Trading</button>
        </div>
      )}

      {/* Linked brokers */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", marginBottom: 16, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <SectionTitle>Linked Brokers</SectionTitle>
          {brokers.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "12px 0" }}>No broker linked yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {brokers.map((b) => (
                <div key={b.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius)", padding: "12px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "var(--radius)", background: "var(--bg-hover)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.03em",
                    }}>{b.provider.slice(0, 2)}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        {b.provider}{b.nickname ? <span style={{ color: "var(--text-muted)", fontWeight: 500 }}> · {b.nickname}</span> : ""}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        Linked {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => unlinkBroker(b.id)} disabled={busy} style={{
                    padding: "6px 14px", borderRadius: "var(--radius)", border: "1px solid var(--border-light)",
                    background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: 12, cursor: "pointer",
                  }}>Unlink</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link form */}
        <div style={{ padding: "16px 20px" }}>
          <SectionTitle>Link a Broker</SectionTitle>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
            Complete the broker's own login flow, then paste the resulting access token here. We never see your broker password. See <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>docs/LIVE_TRADING.md</code> for per-broker steps.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
            <Field label="Broker">
              <select value={provider} onChange={(e) => setProvider(e.target.value as any)} style={selectStyle}>
                {BROKERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Access Token">
              <input
                placeholder="Paste access token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border-light)")}
              />
            </Field>
            <Field label="Nickname (optional)">
              <input
                placeholder="e.g. My Zerodha"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border-light)")}
              />
            </Field>
            <button onClick={linkBroker} disabled={busy || !accessToken} style={{
              padding: "9px 20px", borderRadius: "var(--radius)", border: "none",
              background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: busy || !accessToken ? "not-allowed" : "pointer", opacity: busy || !accessToken ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}>Link</button>
          </div>
        </div>
      </div>

      {/* Enable / Controls */}
      {(isEligible || isEnabled) && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", marginBottom: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: isEnabled ? "1px solid var(--border)" : undefined }}>
            <SectionTitle>{isEnabled ? "Live Trading Controls" : "Enable Live Trading"}</SectionTitle>

            {isEligible && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <Field label="Select Broker">
                  <select value={selectedBrokerId} onChange={(e) => setSelectedBrokerId(e.target.value)} style={{ ...selectStyle, width: 260 }}>
                    <option value="">Select a linked broker…</option>
                    {brokers.map((b) => <option key={b.id} value={b.id}>{b.provider}{b.nickname ? ` (${b.nickname})` : ""}</option>)}
                  </select>
                </Field>
                <button onClick={enable} disabled={busy || brokers.length === 0} style={{
                  padding: "9px 22px", borderRadius: "var(--radius)", border: "none",
                  background: "var(--green)", color: "#fff", fontWeight: 800, fontSize: 13,
                  cursor: busy || brokers.length === 0 ? "not-allowed" : "pointer",
                  opacity: busy || brokers.length === 0 ? 0.5 : 1,
                  boxShadow: "0 2px 12px #3fb95033",
                }}>Enable Live Trading</button>
              </div>
            )}

            {isEnabled && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => toggleKillSwitch(!account.killSwitchActive)} disabled={busy} style={{
                  padding: "9px 20px", borderRadius: "var(--radius)", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  background: account.killSwitchActive ? "var(--green)" : "var(--red)", color: "#fff",
                  boxShadow: account.killSwitchActive ? "0 2px 12px #3fb95033" : "0 2px 12px #f8514933",
                }}>
                  {account.killSwitchActive ? "▶ Resume Trading" : "⏸ Pause (Kill Switch)"}
                </button>
                <button onClick={disable} disabled={busy} style={{
                  padding: "9px 20px", borderRadius: "var(--radius)", border: "1px solid var(--border-light)",
                  background: "transparent", color: "var(--text-secondary)", fontWeight: 600, fontSize: 13, cursor: "pointer",
                }}>Disable Live Trading</button>
              </div>
            )}
          </div>

          {/* Risk limits */}
          {isEnabled && (
            <div style={{ padding: "16px 20px" }}>
              <SectionTitle>Risk Limits</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
                <Field label="Daily Order Limit">
                  <input
                    type="number" min={1} value={dailyOrderLimit}
                    onChange={(e) => setDailyOrderLimit(Number(e.target.value))}
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                    onBlur={e => (e.target.style.borderColor = "var(--border-light)")}
                  />
                </Field>
                <Field label="Max Order Value (₹)">
                  <input
                    type="number" min={1} value={maxOrderValue}
                    onChange={(e) => setMaxOrderValue(Number(e.target.value))}
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                    onBlur={e => (e.target.style.borderColor = "var(--border-light)")}
                  />
                </Field>
                <button onClick={saveRiskLimits} disabled={busy} style={{
                  padding: "9px 20px", borderRadius: "var(--radius)", border: "none",
                  background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13,
                  cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
                }}>Save</button>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 20 }}>
                {[
                  { label: "Daily limit", value: dailyOrderLimit },
                ].map((s) => (
                  <div key={s.label} style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {s.label}: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Message */}
      {message && (
        <div style={{
          padding: "12px 16px", borderRadius: "var(--radius-lg)", fontSize: 13, fontWeight: 600,
          background: message.ok ? "var(--green-bg)" : "var(--red-bg)",
          border: `1px solid ${message.ok ? "var(--green-border)" : "var(--red-border)"}`,
          color: message.ok ? "var(--green)" : "var(--red)",
        }}>
          {message.ok ? "✓ " : "✕ "}{message.text}
        </div>
      )}
    </div>
  );
}
