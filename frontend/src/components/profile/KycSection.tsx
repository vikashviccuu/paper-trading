import { useState, FormEvent } from "react";
import { api } from "../../services/api";
import { Kyc, KycAPI, KycDocument } from "../../services/profileApi";
import { PCard, PField, PBtn, PMsg } from "./ProfileUI";

const DOCS: Array<{ value: KycDocument["type"]; label: string; icon: string }> = [
  { value: "PAN_CARD",      label: "PAN Card",                          icon: "🪪" },
  { value: "AADHAAR_FRONT", label: "Aadhaar (Front)",                   icon: "🪪" },
  { value: "AADHAAR_BACK",  label: "Aadhaar (Back)",                    icon: "🪪" },
  { value: "ADDRESS_PROOF", label: "Address Proof",                     icon: "📄" },
  { value: "BANK_PROOF",    label: "Bank Proof (cheque / passbook)",    icon: "🏦" },
  { value: "PHOTO",         label: "Photograph",                        icon: "📷" },
];

const STATUS_BADGE: Record<string, string> = {
  NOT_STARTED:       "p-badge-gray",
  DOCUMENTS_PENDING: "p-badge-yellow",
  SUBMITTED:         "p-badge-blue",
  UNDER_REVIEW:      "p-badge-blue",
  VERIFIED:          "p-badge-green",
  REJECTED:          "p-badge-red",
};

const DOC_STATUS_BADGE: Record<string, string> = {
  PENDING:  "p-badge-yellow",
  APPROVED: "p-badge-green",
  REJECTED: "p-badge-red",
};

export default function KycSection({ fullName, kyc, onChanged }: { fullName: string; kyc: Kyc; onChanged: () => void }) {
  const [pan,  setPan]  = useState(kyc.panNumber ?? "");
  const [dob,  setDob]  = useState("");
  const [panMsg,    setPanMsg]    = useState<{ text: string; ok: boolean } | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [submitMsg, setSubmitMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const docByType = new Map(kyc.documents.map((d) => [d.type, d]));

  async function verifyPan(e: FormEvent) {
    e.preventDefault(); setBusy(true); setPanMsg(null);
    try {
      const r = await KycAPI.verifyPan(pan.toUpperCase(), fullName, dob || undefined);
      setPanMsg({ text: r.data.verification.valid ? `✓ PAN verified via ${r.data.kyc.panVerificationProvider}.` : "PAN could not be verified — check the number and name.", ok: r.data.verification.valid });
      onChanged();
    } catch (err: any) { setPanMsg({ text: err.response?.data?.error ?? "PAN verification failed", ok: false }); }
    finally { setBusy(false); }
  }

  async function uploadDoc(type: KycDocument["type"], file: File) {
    setBusy(true); setUploadMsg(null);
    try {
      await KycAPI.uploadDocument(type, file);
      setUploadMsg({ text: `${type.replace(/_/g, " ")} uploaded successfully.`, ok: true }); onChanged();
    } catch (err: any) { setUploadMsg({ text: err.response?.data?.error ?? "Upload failed", ok: false }); }
    finally { setBusy(false); }
  }

  async function viewDoc(doc: KycDocument) {
    const r = await api.get(`/kyc/documents/${doc.id}/file`, { responseType: "blob" });
    window.open(URL.createObjectURL(r.data), "_blank");
  }

  async function submit() {
    setBusy(true); setSubmitMsg(null);
    try {
      await KycAPI.submit();
      setSubmitMsg({ text: "Submitted for admin review.", ok: true }); onChanged();
    } catch (err: any) { setSubmitMsg({ text: err.response?.data?.error ?? "Could not submit", ok: false }); }
    finally { setBusy(false); }
  }

  return (
    <PCard title="KYC Verification" icon="🛡️" subtitle="Complete KYC to unlock contest prizes and live trading">
      {/* Status banner */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "12px 16px", background: "var(--bg-elevated)", borderRadius: 10, border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>KYC Status</span>
        <span className={`p-badge ${STATUS_BADGE[kyc.status] ?? "p-badge-gray"}`}>{kyc.status.replace(/_/g, " ")}</span>
      </div>
      {kyc.status === "REJECTED" && kyc.rejectionReason && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, color: "var(--red)", fontSize: 13 }}>
          ✗ Rejected: {kyc.rejectionReason}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Step 1: PAN */}
        <div className="p-step">
          <div className="p-step-num">1</div>
          <div style={{ flex: 1 }}>
            <div className="p-step-title">
              Verify PAN {kyc.panVerified && <span className="p-badge p-badge-green" style={{ marginLeft: 8 }}>✓ Verified</span>}
            </div>
            <div className="p-hint" style={{ marginBottom: 12 }}>Verified online via Setu / Cashfree. Falls back to mock in dev.</div>
            <form onSubmit={verifyPan} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <PField label="PAN Number">
                  <input className="p-input" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F" required />
                </PField>
                <PField label="Date of Birth (optional)">
                  <input className="p-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </PField>
              </div>
              <PBtn loading={busy}>{kyc.panVerified ? "Re-verify PAN" : "Verify PAN"}</PBtn>
              {panMsg && <PMsg ok={panMsg.ok}>{panMsg.text}</PMsg>}
            </form>
          </div>
        </div>

        {/* Step 2: Documents */}
        <div className="p-step">
          <div className="p-step-num">2</div>
          <div style={{ flex: 1 }}>
            <div className="p-step-title">Upload Documents</div>
            <div className="p-hint" style={{ marginBottom: 12 }}>PNG, JPG, WEBP or PDF · Max 5 MB each</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {DOCS.map((dt) => {
                const doc = docByType.get(dt.value);
                return (
                  <div key={dt.value} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, transition: "border-color 0.15s" }}>
                    <span style={{ fontSize: 20 }}>{dt.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{dt.label}</div>
                      {doc && <span className={`p-badge ${DOC_STATUS_BADGE[doc.status] ?? "p-badge-gray"}`} style={{ marginTop: 3 }}>{doc.status}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {doc && <button type="button" className="p-btn-sec" onClick={() => viewDoc(doc)}>View</button>}
                      <label style={{ padding: "8px 14px", background: "var(--blue-bg)", color: "var(--accent)", border: "1px solid var(--blue-border)", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }}>
                        {doc ? "Replace" : "Upload"}
                        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(dt.value, f); }} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            {uploadMsg && <div style={{ marginTop: 10 }}><PMsg ok={uploadMsg.ok}>{uploadMsg.text}</PMsg></div>}
          </div>
        </div>

        {/* Step 3: Submit */}
        <div className="p-step">
          <div className="p-step-num">3</div>
          <div style={{ flex: 1 }}>
            <div className="p-step-title">Submit for Review</div>
            <div className="p-hint" style={{ marginBottom: 12 }}>Requires verified PAN + PAN Card, Address Proof and Photo uploaded. An admin reviews and approves.</div>
            <PBtn loading={busy} onClick={submit} type="button"
              variant={kyc.status === "VERIFIED" ? "secondary" : "primary"}>
              {kyc.status === "VERIFIED" ? "✓ Already Verified" : kyc.status === "SUBMITTED" || kyc.status === "UNDER_REVIEW" ? "Submitted — Awaiting Review" : "Submit for Review"}
            </PBtn>
            {submitMsg && <div style={{ marginTop: 10 }}><PMsg ok={submitMsg.ok}>{submitMsg.text}</PMsg></div>}
          </div>
        </div>
      </div>
    </PCard>
  );
}
