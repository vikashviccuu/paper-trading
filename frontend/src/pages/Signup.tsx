import { useState, FormEvent, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthAPI } from "../services/api";
import { useAuth } from "../store/AuthContext";

export default function Signup() {
  const [step, setStep] = useState<"form" | "verify">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // OTP Verification state
  const [pendingUserId, setPendingUserId] = useState<string>("");
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [demoOtps, setDemoOtps] = useState<{ emailOtp?: string; phoneOtp?: string } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  async function onSignupSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    if (!phone || phone.length !== 10) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = `+91${phone.trim()}`;
      const res = await AuthAPI.signup(name, email, password, formattedPhone);

      if (res.data.requiresVerification) {
        setPendingUserId(res.data.userId);
        if (res.data.demoOtp) {
          setDemoOtps(res.data.demoOtp);
        }
        setStep("verify");
        setResendCooldown(30);
        setInfoMsg("Verification codes have been dispatched to your email and mobile number (via MSG91 SMS).");
      } else if (res.data.token) {
        login(res.data.token, res.data.user);
        navigate("/");
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Signup failed. Please check your information and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifySubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    if (emailOtp.length !== 6) {
      setError("Please enter the 6-digit verification code sent to your email.");
      return;
    }

    if (phoneOtp.length !== 6) {
      setError("Please enter the 6-digit verification code sent to your mobile.");
      return;
    }

    setLoading(true);
    try {
      const res = await AuthAPI.verifyRegistrationOtp({
        userId: pendingUserId,
        emailOtp: emailOtp.trim(),
        phoneOtp: phoneOtp.trim(),
      });

      if (res.data.token) {
        login(res.data.token, res.data.user);
        navigate("/");
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Verification failed. Please check the OTP codes.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(channel: "email" | "phone" | "both") {
    if (!pendingUserId || resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      const res = await AuthAPI.resendVerificationOtp({ userId: pendingUserId, channel });
      if (res.data.demoOtp) {
        setDemoOtps(res.data.demoOtp);
      }
      setResendCooldown(30);
      setInfoMsg(res.data.message || `Verification codes resent to ${channel}.`);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  }

  function handleAutoFillDemo() {
    if (demoOtps?.emailOtp) setEmailOtp(demoOtps.emailOtp);
    if (demoOtps?.phoneOtp) setPhoneOtp(demoOtps.phoneOtp);
  }

  return (
    <div className="auth-page">
      <div className="auth-bg-blob-1" />
      <div className="auth-bg-blob-2" />

      <div className="auth-card">
        {/* Top Emblem */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: step === "verify" ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #1d4ed8, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 20, color: "#fff",
            boxShadow: "0 8px 20px rgba(37, 99, 235, 0.35)",
            marginBottom: 14
          }}>
            {step === "verify" ? "🛡️" : "PT"}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            {step === "form" ? "Create Your Account" : "Verify Email & Mobile"}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, textAlign: "center" }}>
            {step === "form" ? (
              <>Get <span style={{ color: "#3fb950", fontWeight: 700 }}>₹10,00,000</span> virtual cash to start trading live market quotes</>
            ) : (
              <>Enter the 6-digit verification codes sent to your email and mobile phone to activate your account</>
            )}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: "rgba(248, 81, 73, 0.12)", border: "1px solid rgba(248, 81, 73, 0.3)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 18,
            color: "#f85149", fontSize: 13, display: "flex", alignItems: "center", gap: 10
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Info Alert */}
        {infoMsg && (
          <div style={{
            background: "rgba(63, 185, 80, 0.12)", border: "1px solid rgba(63, 185, 80, 0.3)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 18,
            color: "#3fb950", fontSize: 13, display: "flex", alignItems: "center", gap: 10
          }}>
            <span>✓ {infoMsg}</span>
          </div>
        )}

        {/* Demo OTP Banner (instant 1-click test in non-production) */}
        {step === "verify" && demoOtps && (demoOtps.emailOtp || demoOtps.phoneOtp) && (
          <div style={{
            background: "rgba(37, 99, 235, 0.15)",
            border: "1px solid rgba(37, 99, 235, 0.4)",
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 20,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                ⚡ Test Mode OTPs
              </span>
              <button
                type="button"
                onClick={handleAutoFillDemo}
                style={{
                  background: "#2563eb",
                  border: "none",
                  color: "#fff",
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Auto-fill Both
              </button>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#e6edf3" }}>
              {demoOtps.emailOtp && (
                <div>Email Code: <strong style={{ letterSpacing: 1, color: "#93c5fd" }}>{demoOtps.emailOtp}</strong></div>
              )}
              {demoOtps.phoneOtp && (
                <div>Mobile Code: <strong style={{ letterSpacing: 1, color: "#93c5fd" }}>{demoOtps.phoneOtp}</strong></div>
              )}
            </div>
          </div>
        )}

        {/* STEP 1: Registration Form */}
        {step === "form" && (
          <form onSubmit={onSignupSubmit}>
            {/* Full Name */}
            <div className="auth-input-wrapper">
              <div className="auth-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <input
                className="auth-input"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Email Address */}
            <div className="auth-input-wrapper">
              <div className="auth-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
              <input
                className="auth-input"
                placeholder="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Mobile Number */}
            <div className="auth-input-wrapper" style={{ position: "relative" }}>
              <div className="auth-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <div style={{
                position: "absolute", left: 40, fontSize: 13, fontWeight: 700,
                color: "#60a5fa", pointerEvents: "none", borderRight: "1px solid rgba(255,255,255,0.12)",
                paddingRight: 8, lineHeight: "20px"
              }}>
                +91
              </div>
              <input
                className="auth-input"
                placeholder="Mobile number (10 digits)"
                type="tel"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                required
                style={{ paddingLeft: 84 }}
              />
            </div>

            {/* Password */}
            <div className="auth-input-wrapper">
              <div className="auth-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                className="auth-input"
                placeholder="Password (min 6 chars)"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute", right: 12, background: "none", border: "none",
                  color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center"
                }}
              >
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>

            <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? "Sending Verification Codes..." : "Create Account & Verify OTP →"}
            </button>
          </form>
        )}

        {/* STEP 2: Dual Verification Screen */}
        {step === "verify" && (
          <form onSubmit={onVerifySubmit}>
            {/* Email OTP Card */}
            <div style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📧</span> Email Verification Code
                </span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{email}</span>
              </div>
              <input
                className="auth-input"
                placeholder="6-digit email OTP"
                type="text"
                maxLength={6}
                value={emailOtp}
                onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ""))}
                required
                style={{ letterSpacing: 4, fontWeight: 700, fontSize: 15, textAlign: "center" }}
              />
            </div>

            {/* Mobile OTP Card (MSG91 SMS) */}
            <div style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 18,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📱</span> Mobile SMS Code (MSG91)
                </span>
                <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>+91 {phone}</span>
              </div>
              <input
                className="auth-input"
                placeholder="6-digit mobile SMS OTP"
                type="text"
                maxLength={6}
                value={phoneOtp}
                onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ""))}
                required
                style={{ letterSpacing: 4, fontWeight: 700, fontSize: 15, textAlign: "center" }}
              />
            </div>

            <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Validating Codes..." : "Validate & Complete Registration ✓"}
            </button>

            {/* Resend Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, fontSize: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setError(null);
                }}
                style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}
              >
                ← Edit Information
              </button>

              <button
                type="button"
                onClick={() => handleResend("both")}
                disabled={loading || resendCooldown > 0}
                style={{
                  background: "none", border: "none",
                  color: resendCooldown > 0 ? "#484f58" : "#60a5fa",
                  fontWeight: 600, cursor: resendCooldown > 0 ? "default" : "pointer"
                }}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Codes 🔄"}
              </button>
            </div>
          </form>
        )}

        <div style={{ marginTop: 24, textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "#60a5fa", fontWeight: 600 }}>
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
