import { useState, FormEvent } from "react";
import { ProfileAPI, UserProfile } from "../../services/profileApi";
import { PCard, PField, PBtn, PMsg } from "./ProfileUI";

export default function CommunicationDetailsForm({ profile, onSaved }: { profile: UserProfile; onSaved: () => void }) {
  const [phone,  setPhone]  = useState(profile.phone ?? "");
  const [otp,    setOtp]    = useState("");
  const [email,  setEmail]  = useState(profile.alternateEmail ?? "");
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp,  setDevOtp]  = useState<string | null>(null);
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [busy,    setBusy]    = useState(false);

  async function sendOtp() {
    setBusy(true); setMsg(null);
    try {
      const r = await ProfileAPI.sendPhoneOtp(phone);
      setOtpSent(true); setDevOtp(r.data.otp ?? null);
      setMsg({ text: "OTP sent to your mobile.", ok: true });
    } catch (err: any) { setMsg({ text: err.response?.data?.error ?? "Could not send OTP", ok: false }); }
    finally { setBusy(false); }
  }

  async function verifyOtp() {
    setBusy(true); setMsg(null);
    try {
      await ProfileAPI.verifyPhoneOtp(phone, otp);
      setMsg({ text: "Phone number verified!", ok: true }); setOtpSent(false); setOtp(""); onSaved();
    } catch (err: any) { setMsg({ text: err.response?.data?.error ?? "Incorrect or expired OTP", ok: false }); }
    finally { setBusy(false); }
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await ProfileAPI.updateCommunication({ alternateEmail: email || undefined });
      setMsg({ text: "Alternate email saved.", ok: true }); onSaved();
    } catch (err: any) { setMsg({ text: err.response?.data?.error ?? "Could not save", ok: false }); }
    finally { setBusy(false); }
  }

  return (
    <PCard title="Contact Details" icon="📱" subtitle="Phone verification and alternate email">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Phone */}
        <div style={{ background: "#131920", border: "1px solid #1e2d3d", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#e6edf3" }}>Mobile Number</div>
            {profile.phoneVerified && <span className="p-badge p-badge-green">✓ Verified</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="p-input" value={phone} onChange={(e) => { setPhone(e.target.value); setOtpSent(false); }} placeholder="10-digit mobile number" maxLength={10} style={{ flex: 1 }} />
            <button type="button" className="p-btn" onClick={sendOtp} disabled={busy || phone.length !== 10} style={{ whiteSpace: "nowrap" }}>
              {profile.phone === phone && profile.phoneVerified ? "Re-verify" : "Send OTP"}
            </button>
          </div>
          {otpSent && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input className="p-input" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit OTP" maxLength={6} style={{ flex: 1 }} />
              <button type="button" className="p-btn" onClick={verifyOtp} disabled={busy || otp.length !== 6}>Verify</button>
            </div>
          )}
          {devOtp && (
            <div style={{ marginTop: 8, padding: "7px 10px", background: "#1e2d42", borderRadius: 6, fontSize: 12, color: "#60a5fa" }}>
              Dev mode — OTP: <strong style={{ fontFamily: "monospace" }}>{devOtp}</strong>
            </div>
          )}
        </div>

        {/* Alternate email */}
        <form onSubmit={saveEmail} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PField label="Alternate Email">
            <input className="p-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alternate@email.com" />
          </PField>
          <PBtn loading={busy}>Save Alternate Email</PBtn>
        </form>

        {msg && <PMsg ok={msg.ok}>{msg.text}</PMsg>}
      </div>
    </PCard>
  );
}
