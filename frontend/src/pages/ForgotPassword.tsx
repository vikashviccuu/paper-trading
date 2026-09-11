import { useState, useEffect, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthAPI } from "../services/api";

export default function ForgotPassword() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Step 1: Send OTP to Mobile (MSG91 SMS) or Email
  async function handleSendOtp(e?: FormEvent) {
    if (e) e.preventDefault();
    setError(null);

    if (method === "phone" && phone.trim().length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (method === "email" && !email.trim()) {
      setError("Please enter your registered email address.");
      return;
    }

    setLoading(true);
    setDevOtp(null);

    try {
      const payload = method === "phone" ? { phone: phone.trim() } : { email: email.trim() };
      const res = await AuthAPI.sendPasswordResetOtp(payload);
      if (res.data.otp) {
        setDevOtp(res.data.otp);
      }
      setSuccessMsg(res.data.message || `Verification code dispatched via ${method === "phone" ? "MSG91 SMS" : "Email"}.`);
      setStep(2);
      setCooldown(60);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Failed to send verification code. Please check your details.");
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify OTP and reset password
  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (otp.trim().length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...(method === "phone" ? { phone: phone.trim() } : { email: email.trim() }),
        otp: otp.trim(),
        newPassword,
      };
      const res = await AuthAPI.resetPassword(payload);
      setSuccessMsg(res.data.message || "Password updated successfully!");
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Failed to reset password. Please verify the code.");
    } finally {
      setLoading(false);
    }
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
            background: step === 3 ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #1d4ed8, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 22, color: "#fff",
            boxShadow: step === 3 ? "0 8px 20px rgba(16, 185, 129, 0.35)" : "0 8px 20px rgba(37, 99, 235, 0.35)",
            marginBottom: 14
          }}>
            {step === 3 ? "✓" : "🔐"}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            {step === 1 && "Reset Password"}
            {step === 2 && "Enter Verification Code"}
            {step === 3 && "Password Reset Complete!"}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, textAlign: "center" }}>
            {step === 1 && "Select whether to receive your 6-digit recovery OTP on your Mobile (via SMS) or Email."}
            {step === 2 && (method === "phone" ? `Enter the 6-digit code sent via MSG91 SMS to mobile ${phone} and choose a new password.` : `Enter the 6-digit code sent to ${email} and choose a new password.`)}
            {step === 3 && "Your account password has been successfully updated. You can now log in."}
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

        {/* Success Alert */}
        {successMsg && step === 2 && (
          <div style={{
            background: "rgba(63, 185, 80, 0.12)", border: "1px solid rgba(63, 185, 80, 0.3)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 18,
            color: "#3fb950", fontSize: 13, display: "flex", alignItems: "center", gap: 10
          }}>
            <span>✓ {successMsg}</span>
          </div>
        )}

        {/* Dev Mode Demo OTP Banner */}
        {devOtp && step === 2 && (
          <div style={{
            background: "rgba(37, 99, 235, 0.15)", border: "1px solid rgba(37, 99, 235, 0.4)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 18,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase" }}>
                Dev Demo OTP Code (MSG91 SMS Sent):
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: 2, marginTop: 2 }}>
                {devOtp}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOtp(devOtp)}
              style={{
                background: "#2563eb", border: "none", color: "#fff", borderRadius: 6,
                padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer"
              }}
            >
              Auto-fill OTP
            </button>
          </div>
        )}

        {/* STEP 1: Method Selector & Input Form */}
        {step === 1 && (
          <form onSubmit={handleSendOtp}>
            {/* Method Tabs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => { setMethod("phone"); setError(null); }}
                style={{
                  padding: "10px",
                  borderRadius: 8,
                  border: method === "phone" ? "1px solid #3b82f6" : "1px solid var(--border)",
                  background: method === "phone" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                  color: method === "phone" ? "#60a5fa" : "var(--text-secondary)",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>📱 Mobile SMS</span>
              </button>
              <button
                type="button"
                onClick={() => { setMethod("email"); setError(null); }}
                style={{
                  padding: "10px",
                  borderRadius: 8,
                  border: method === "email" ? "1px solid #3b82f6" : "1px solid var(--border)",
                  background: method === "email" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                  color: method === "email" ? "#60a5fa" : "var(--text-secondary)",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>✉️ Email</span>
              </button>
            </div>

            {/* Mobile Number Option */}
            {method === "phone" && (
              <div>
                <div className="auth-input-wrapper">
                  <div style={{
                    position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                    display: "flex", alignItems: "center", gap: 6,
                    paddingRight: 8, borderRight: "1px solid var(--border)",
                    color: "var(--text-secondary)", fontSize: 13, fontWeight: 700, pointerEvents: "none"
                  }}>
                    <span>🇮🇳</span>
                    <span>+91</span>
                  </div>
                  <input
                    className="auth-input"
                    placeholder="Enter 10-digit mobile number"
                    type="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    required
                    autoFocus
                    style={{ paddingLeft: 84 }}
                  />
                </div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -8, marginBottom: 16 }}>
                  A 6-digit recovery OTP will be sent directly to your phone via MSG91 SMS.
                </p>
              </div>
            )}

            {/* Email Option */}
            {method === "email" && (
              <div>
                <div className="auth-input-wrapper">
                  <div className="auth-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </div>
                  <input
                    className="auth-input"
                    placeholder="Your registered email address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -8, marginBottom: 16 }}>
                  A 6-digit recovery OTP will be dispatched to your registered email address.
                </p>
              </div>
            )}

            <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Sending Code..." : method === "phone" ? "Send OTP via SMS 📱" : "Send OTP to Email ✉️"}
            </button>
          </form>
        )}

        {/* STEP 2: Enter OTP & New Password Form */}
        {step === 2 && (
          <form onSubmit={handleResetPassword}>
            {/* OTP Code input */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                6-Digit Verification Code {method === "phone" ? "(via MSG91 SMS)" : "(via Email)"}
              </label>
              <div className="auth-input-wrapper" style={{ marginBottom: 0 }}>
                <div className="auth-input-icon">
                  <span style={{ fontSize: 16 }}>🔢</span>
                </div>
                <input
                  className="auth-input"
                  placeholder="e.g. 123456"
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  style={{ letterSpacing: 4, fontWeight: 700, fontSize: 16 }}
                />
              </div>
            </div>

            {/* New Password */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                New Password (minimum 6 characters)
              </label>
              <div className="auth-input-wrapper" style={{ marginBottom: 0 }}>
                <div className="auth-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <input
                  className="auth-input"
                  placeholder="New password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
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
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                Confirm New Password
              </label>
              <div className="auth-input-wrapper" style={{ marginBottom: 0 }}>
                <div className="auth-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <input
                  className="auth-input"
                  placeholder="Confirm new password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Resetting Password..." : "Update Password"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                style={{ background: "none", border: "none", color: "#8b949e", fontSize: 12, cursor: "pointer" }}
              >
                ← Change {method === "phone" ? "Mobile" : "Email"}
              </button>
              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={loading || cooldown > 0}
                style={{
                  background: "none",
                  border: "none",
                  color: cooldown > 0 ? "#6b7280" : "#60a5fa",
                  fontSize: 12,
                  cursor: cooldown > 0 ? "default" : "pointer",
                  fontWeight: 600
                }}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend Code 🔄"}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Success Confirmation */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{
              background: "rgba(63, 185, 80, 0.12)",
              border: "1px solid rgba(63, 185, 80, 0.3)",
              borderRadius: 12,
              padding: "16px 20px",
              textAlign: "center",
              color: "#3fb950",
              fontSize: 14,
              lineHeight: 1.5,
              width: "100%",
            }}>
              Your password has been successfully updated and secured. You can now use your new password to sign into your trading terminal.
            </div>

            <button
              className="auth-btn-primary"
              type="button"
              onClick={() => navigate("/login")}
              style={{ marginTop: 8, width: "100%" }}
            >
              Sign In Now →
            </button>
          </div>
        )}

        {/* Bottom Back to Login Link */}
        <div style={{ marginTop: 24, textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <Link to="/login" style={{ color: "#60a5fa", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
