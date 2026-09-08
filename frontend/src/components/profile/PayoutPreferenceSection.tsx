import { useState } from "react";
import { ProfileAPI, UserProfile } from "../../services/profileApi";
import { PCard, PMsg } from "./ProfileUI";

export default function PayoutPreferenceSection({ profile, onSaved }: { profile: UserProfile; onSaved: () => void }) {
  const [pref, setPref] = useState<"CASH_WITHDRAWAL" | "PROP_TRADING">(profile.payoutPreference ?? "CASH_WITHDRAWAL");
  const [msg,  setMsg]  = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(next: "CASH_WITHDRAWAL" | "PROP_TRADING") {
    setPref(next); setBusy(true); setMsg(null);
    try {
      await ProfileAPI.updatePayoutPreference(next);
      setMsg({ text: "Payout preference saved.", ok: true }); onSaved();
    } catch (err: any) {
      setMsg({ text: err.response?.data?.error ?? "Could not save", ok: false });
    } finally { setBusy(false); }
  }

  const options: Array<{ value: "CASH_WITHDRAWAL" | "PROP_TRADING"; icon: string; title: string; desc: string; badge?: string }> = [
    {
      value: "CASH_WITHDRAWAL", icon: "💰", title: "Cash Withdrawal",
      desc: "Net winnings (after 30% TDS) are paid directly to your verified primary bank account. Requires KYC + verified bank account before an award can be released.",
    },
    {
      value: "PROP_TRADING", icon: "🚀", title: "Prop Trading — Live Trading Unlock", badge: "Unlocks Live Trading",
      desc: "Net winnings are still paid to your bank account. Additionally, a successful payout unlocks Live Trading eligibility — trade real capital through your own linked broker account.",
    },
  ];

  return (
    <PCard title="Payout Preference" icon="💸" subtitle="How contest prize money is paid out to you">
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16, padding: "10px 12px", background: "#131920", borderRadius: 8, border: "1px solid #1e2d3d" }}>
        ℹ️ Applies to <strong style={{ color: "#8b949e" }}>future prize awards only</strong> — never retroactively changes an already-computed award.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map((o) => {
          const sel = pref === o.value;
          return (
            <div key={o.value} onClick={() => !busy && save(o.value)} style={{
              display: "flex", alignItems: "flex-start", gap: 14, padding: 16, borderRadius: 12,
              cursor: busy ? "not-allowed" : "pointer",
              border: `2px solid ${sel ? "#2563eb" : "#1e2d3d"}`,
              background: sel ? "#0a1628" : "#131920",
              transition: "all 0.15s", opacity: busy ? 0.7 : 1,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: sel ? "#1e3a5f" : "#1a1f2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{o.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: sel ? "#e6edf3" : "#8b949e" }}>{o.title}</span>
                  {o.badge && <span className="p-badge p-badge-blue">{o.badge}</span>}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>{o.desc}</div>
              </div>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${sel ? "#2563eb" : "#2d3f55"}`, background: sel ? "#2563eb" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
              </div>
            </div>
          );
        })}
      </div>
      {msg && <div style={{ marginTop: 14 }}><PMsg ok={msg.ok}>{msg.text}</PMsg></div>}
    </PCard>
  );
}
