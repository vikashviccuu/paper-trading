import { useEffect, useState } from "react";
import { ProfileAPI } from "../services/profileApi";
import PersonalDetailsForm from "../components/profile/PersonalDetailsForm";
import AddressDetailsForm from "../components/profile/AddressDetailsForm";
import CommunicationDetailsForm from "../components/profile/CommunicationDetailsForm";
import KycSection from "../components/profile/KycSection";
import BankAccountsSection from "../components/profile/BankAccountsSection";
import PayoutPreferenceSection from "../components/profile/PayoutPreferenceSection";
import LoginHistorySection from "../components/profile/LoginHistorySection";

const TABS = [
  { id: "personal",  label: "Personal",      icon: "👤" },
  { id: "address",   label: "Address",        icon: "📍" },
  { id: "contact",   label: "Contact",        icon: "📱" },
  { id: "kyc",       label: "KYC",            icon: "🛡️" },
  { id: "bank",      label: "Bank",           icon: "🏦" },
  { id: "payout",    label: "Payout",         icon: "💸" },
  { id: "security",  label: "Security",       icon: "🔐" },
];


const KYC_STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  NOT_STARTED:       { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" },
  DOCUMENTS_PENDING: { bg: "var(--yellow-bg)", color: "var(--yellow)", border: "var(--yellow-border)" },
  SUBMITTED:         { bg: "var(--blue-bg)", color: "var(--accent)", border: "var(--blue-border)" },
  UNDER_REVIEW:      { bg: "var(--blue-bg)", color: "var(--accent)", border: "var(--blue-border)" },
  VERIFIED:          { bg: "var(--green-bg)", color: "var(--green)", border: "var(--green-border)" },
  REJECTED:          { bg: "var(--red-bg)", color: "var(--red)", border: "var(--red-border)" },
};

export default function Profile() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState("personal");

  function load() { ProfileAPI.get().then((r) => setData(r.data)); }
  useEffect(load, []);

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "var(--text-secondary)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <div>Loading profile...</div>
      </div>
    </div>
  );

  const kycStatus = data.kyc?.status ?? "NOT_STARTED";
  const kycStyle  = KYC_STATUS_STYLE[kycStatus] ?? KYC_STATUS_STYLE.NOT_STARTED;
  const initials  = data.user.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() ?? "U";
  const memberSince = new Date(data.user.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "long" });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>

      {/* ── Profile header card ── */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "28px 28px 24px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        gap: 24,
        position: "relative",
        overflow: "hidden",
        boxShadow: "var(--card-shadow)"
      }}>
        {/* Background glow */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, background: "rgba(37, 99, 235, 0.08)", borderRadius: "50%", pointerEvents: "none" }} />

        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, fontWeight: 900, color: "#fff", flexShrink: 0,
          boxShadow: "0 0 0 4px var(--border)",
        }}>{initials}</div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>{data.user.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>{data.user.email} · Member since {memberSince}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...kycStyle, padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, border: `1px solid ${kycStyle.border}` }}>
              🛡️ KYC: {kycStatus.replace(/_/g, " ")}
            </span>
            {data.bankAccounts?.some((b: any) => b.verificationStatus === "VERIFIED") && (
              <span style={{ background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green-border)", padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                🏦 Bank Verified
              </span>
            )}
            {data.profile?.phoneVerified && (
              <span style={{ background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green-border)", padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                📱 Phone Verified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: "flex", gap: 2,
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: 10, padding: 4, marginBottom: 20,
      }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "8px 4px",
            border: "none", borderRadius: 7,
            background: tab === t.id ? "var(--bg-elevated)" : "transparent",
            color: tab === t.id ? "var(--accent)" : "var(--text-secondary)",
            fontWeight: tab === t.id ? 700 : 500,
            fontSize: 12, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            transition: "all 0.15s",
            boxShadow: tab === t.id ? "var(--card-shadow)" : "none",
          }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div>
        {tab === "personal" && <PersonalDetailsForm name={data.user.name} profile={data.profile} onSaved={load} />}
        {tab === "address"  && <AddressDetailsForm  profile={data.profile} onSaved={load} />}
        {tab === "contact"  && <CommunicationDetailsForm profile={data.profile} onSaved={load} />}
        {tab === "kyc"      && <KycSection fullName={data.user.name} kyc={data.kyc ?? { status: "NOT_STARTED", panVerified: false, documents: [] }} onChanged={load} />}
        {tab === "bank"     && <BankAccountsSection accounts={data.bankAccounts ?? []} onChanged={load} />}
        {tab === "payout"   && <PayoutPreferenceSection profile={data.profile} onSaved={load} />}
        {tab === "security" && <LoginHistorySection />}
      </div>
    </div>
  );
}
