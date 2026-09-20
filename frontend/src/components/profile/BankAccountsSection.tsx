import { useState, FormEvent } from "react";
import { BankAccount, BankAccountsAPI } from "../../services/profileApi";
import { PCard, PField, PBtn, PMsg } from "./ProfileUI";

const STATUS_BADGE: Record<BankAccount["verificationStatus"], string> = {
  NOT_VERIFIED: "p-badge-gray",
  PENDING:      "p-badge-yellow",
  VERIFIED:     "p-badge-green",
  FAILED:       "p-badge-red",
};

export default function BankAccountsSection({ accounts, onChanged }: { accounts: BankAccount[]; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [holderName, setHolderName] = useState("");
  const [accNo,      setAccNo]      = useState("");
  const [confirmNo,  setConfirmNo]  = useState("");
  const [ifsc,       setIfsc]       = useState("");
  const [msg,  setMsg]  = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg(null);
    if (accNo !== confirmNo) { setMsg({ text: "Account numbers don't match.", ok: false }); return; }
    setBusy(true);
    try {
      const r = await BankAccountsAPI.add({ accountHolderName: holderName, accountNumber: accNo, ifsc: ifsc.toUpperCase() });
      setMsg({ text: r.data.verificationStatus === "VERIFIED" ? `✓ Verified — name matched: ${r.data.nameMatchResult}` : "Added, but online verification did not pass. Please re-verify.", ok: r.data.verificationStatus === "VERIFIED" });
      setHolderName(""); setAccNo(""); setConfirmNo(""); setIfsc(""); setShowAdd(false); onChanged();
    } catch (err: any) { setMsg({ text: err.response?.data?.error ?? "Could not add bank account", ok: false }); }
    finally { setBusy(false); }
  }

  async function reverify(id: string) { setBusy(true); try { await BankAccountsAPI.reverify(id); onChanged(); } finally { setBusy(false); } }
  async function setPrimary(id: string) { setBusy(true); try { await BankAccountsAPI.setPrimary(id); onChanged(); } catch (err: any) { setMsg({ text: err.response?.data?.error ?? "Could not set primary", ok: false }); } finally { setBusy(false); } }
  async function remove(id: string) { setBusy(true); try { await BankAccountsAPI.remove(id); onChanged(); } finally { setBusy(false); } }

  return (
    <PCard title="Bank Accounts" icon="🏦" subtitle="Verified bank accounts for contest prize payouts">
      {/* Existing accounts */}
      {accounts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {accounts.map((a) => (
            <div key={a.id} style={{ background: "var(--bg-elevated)", border: `1px solid ${a.isPrimary ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, padding: "16px 18px", boxShadow: "var(--card-shadow)", transition: "all 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 24 }}>🏦</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", fontFamily: "monospace" }}>
                      ••••{a.accountNumber.slice(-4)}
                      {a.isPrimary && <span className="p-badge p-badge-blue" style={{ marginLeft: 8 }}>Primary</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{a.ifsc}{a.bankName ? ` · ${a.bankName}` : ""}{a.nameAtBank ? ` · ${a.nameAtBank}` : ""}</div>
                  </div>
                </div>
                <span className={`p-badge ${STATUS_BADGE[a.verificationStatus]}`}>{a.verificationStatus.replace(/_/g, " ")}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {a.verificationStatus !== "VERIFIED" && <button className="p-btn-sec" onClick={() => reverify(a.id)} disabled={busy}>Re-verify</button>}
                {a.verificationStatus === "VERIFIED" && !a.isPrimary && <button className="p-btn-sec" onClick={() => setPrimary(a.id)} disabled={busy}>Set Primary</button>}
                <button className="p-btn-danger" onClick={() => remove(a.id)} disabled={busy}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {accounts.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: "28px 0", color: "var(--text-secondary)", marginBottom: 16 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏦</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>No bank accounts added yet.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Add a bank account to receive contest prize payouts.</div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 16, boxShadow: "var(--card-shadow)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 14 }}>Add New Bank Account</div>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PField label="Account Holder Name" required>
              <input className="p-input" value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="As per bank records" required />
            </PField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <PField label="Account Number" required>
                <input className="p-input" value={accNo} onChange={(e) => setAccNo(e.target.value)} placeholder="Account number" required />
              </PField>
              <PField label="Confirm Account Number" required>
                <input className="p-input" value={confirmNo} onChange={(e) => setConfirmNo(e.target.value)} placeholder="Re-enter account number" required />
              </PField>
            </div>
            <PField label="IFSC Code" required>
              <input className="p-input" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="HDFC0001234" maxLength={11} required />
            </PField>
            <div style={{ display: "flex", gap: 8 }}>
              <PBtn loading={busy}>Add &amp; Verify</PBtn>
              <button type="button" className="p-btn-sec" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {msg && <div style={{ marginBottom: 12 }}><PMsg ok={msg.ok}>{msg.text}</PMsg></div>}

      {!showAdd && (
        <button className="p-btn" type="button" onClick={() => setShowAdd(true)} style={{ width: "100%", textAlign: "center" }}>
          + Add Bank Account
        </button>
      )}
    </PCard>
  );
}
