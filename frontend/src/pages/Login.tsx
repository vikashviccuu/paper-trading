import { useState, FormEvent, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthAPI } from "../services/api";
import { useAuth } from "../store/AuthContext";

export default function Login() {
  const [step, setStep] = useState<"credentials" | "login_otp" | "unverified_dual">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // OTP Verification state
  const [pendingUserId, setPendingUserId] = useState<string>("");
  const [maskedPhone, setMaskedPhone] = useState<string>("");
  const [loginOtp, setLoginOtp] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [demoOtps, setDemoOtps] = useState<{ emailOtp?: string; phoneOtp?: string; otp?: string } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Submit username & password
  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      const res = await AuthAPI.login(email.trim(), password);

      // Scenario 1: User needs to complete registration dual OTP
      if (res.data.requiresVerification) {
        setPendingUserId(res.data.userId || "");
        setMaskedPhone(res.data.phone || "");
        if (res.data.demoOtp) setDemoOtps(res.data.demoOtp);
        setStep("unverified_dual");
        setResendCooldown(30);
        setInfoMsg("Account requires OTP validation before access. Verification codes have been sent to your email and phone.");
        return;
      }

      // Scenario 2: Modern Login 2FA OTP gate
      if (res.data.requiresLoginOtp) {
        setPendingUserId(res.data.userId || "");
        setMaskedPhone(res.data.phone || "");
        if (res.data.demoOtp) setDemoOtps(res.data.demoOtp);
        setStep("login_otp");
        setResendCooldown(30);
        setInfoMsg(res.data.message || "Security OTP sent to your registered mobile (via MSG91 SMS).");
        return;
      }

      // Scenario 3: Direct token
      if (res.data.token) {
        login(res.data.token, res.data.user);
        navigate("/");
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  // Submit Login 2FA OTP
  async function onSubmitLoginOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    if (loginOtp.length !== 6) {
      setError("Please enter the 6-digit login verification code.");
      return;
    }

    setLoading(true);
    try {
      const res = await AuthAPI.verifyLoginOtp({
        userId: pendingUserId,
        otp: loginOtp.trim(),
      });

      if (res.data.token) {
        login(res.data.token, res.data.user);
        navigate("/");
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Invalid or expired login OTP code.");
    } finally {
      setLoading(false);
    }
  }

  // Submit Dual Unverified OTP (if user signed up previously without verifying)
  async function onSubmitDualOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    if (emailOtp.length !== 6 || phoneOtp.length !== 6) {
      setError("Please enter both 6-digit verification codes.");
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
      setError(err.response?.data?.error ?? "Verification failed. Please check your codes.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (!pendingUserId || resendCooldown > 0) return;
    setError(null);
    setLoading(true);

    try {
      if (step === "login_otp") {
        const res = await AuthAPI.login(email.trim(), password);
        if (res.data.demoOtp) setDemoOtps(res.data.demoOtp);
        setInfoMsg("Security login code resent via MSG91 SMS.");
      } else {
        const res = await AuthAPI.resendVerificationOtp({ userId: pendingUserId, channel: "both" });
        if (res.data.demoOtp) setDemoOtps(res.data.demoOtp);
        setInfoMsg("Verification codes resent to your email and mobile.");
      }
      setResendCooldown(30);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Failed to resend code.");
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 26 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: step !== "credentials" ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #1d4ed8, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 20, color: "#fff",
            boxShadow: "0 8px 20px rgba(37, 99, 235, 0.35)",
            marginBottom: 14
          }}>
            {step !== "credentials" ? "🛡️" : "PT"}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            {step === "credentials" && "Welcome Back"}
            {step === "login_otp" && "Two-Factor Verification"}
            {step === "unverified_dual" && "Complete Account Validation"}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, textAlign: "center" }}>
            {step === "credentials" && "Enter your credentials to access your trading terminal"}
            {step === "login_otp" && `Enter the 6-digit security code sent to ${maskedPhone || email} via MSG91 SMS`}
            {step === "unverified_dual" && "Validate your email and mobile phone with the verification OTPs"}
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

        {/* Dev Mode OTP Banner */}
        {step !== "credentials" && demoOtps && (
          <div style={{
            background: "rgba(37, 99, 235, 0.15)",
            border: "1px solid rgba(37, 99, 235, 0.4)",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase" }}>
                ⚡ Test Mode Demo Code
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: 2, marginTop: 2 }}>
                {demoOtps.otp || `Email: ${demoOtps.emailOtp} | Mobile: ${demoOtps.phoneOtp}`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (demoOtps.otp) setLoginOtp(demoOtps.otp);
                if (demoOtps.emailOtp) setEmailOtp(demoOtps.emailOtp);
                if (demoOtps.phoneOtp) setPhoneOtp(demoOtps.phoneOtp);
              }}
              style={{
                background: "#2563eb",
                border: "none",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Auto-fill Code
            </button>
          </div>
        )}

        {/* STEP 1: Email + Password Form */}
        {step === "credentials" && (
          <form onSubmit={onSubmitCredentials}>
            {/* Email Input */}
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

            {/* Password Input */}
            <div className="auth-input-wrapper">
              <div className="auth-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                className="auth-input"
                placeholder="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14, marginTop: -4 }}>
              <Link
                to="/forgot-password"
                style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none", fontWeight: 500 }}
              >
                Forgot password?
              </Link>
            </div>

            <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Authenticating..." : "Sign In →"}
            </button>
          </form>
        )}

        {/* STEP 2: Modern Login 2FA OTP Form */}
        {step === "login_otp" && (
          <form onSubmit={onSubmitLoginOtp}>
            <div style={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 12,
              padding: "16px 18px",
              marginBottom: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📱</span> Mobile &amp; Email Login Code
                </span>
                <span style={{ fontSize: 11, color: "#3fb950", fontWeight: 600 }}>● MSG91 Active</span>
              </div>
              <input
                className="auth-input"
                placeholder="Enter 6-digit OTP"
                type="text"
                maxLength={6}
                value={loginOtp}
                onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                style={{ letterSpacing: 6, fontWeight: 800, fontSize: 18, textAlign: "center" }}
              />
            </div>

            <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Verifying..." : "Confirm & Enter Terminal ✓"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, fontSize: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setError(null);
                }}
                style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}
              >
                ← Change Account
              </button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading || resendCooldown > 0}
                style={{
                  background: "none", border: "none",
                  color: resendCooldown > 0 ? "#484f58" : "#60a5fa",
                  fontWeight: 600, cursor: resendCooldown > 0 ? "default" : "pointer"
                }}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP 🔄"}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Dual Unverified Account OTP Form */}
        {step === "unverified_dual" && (
          <form onSubmit={onSubmitDualOtp}>
            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e6edf3", marginBottom: 6 }}>
                📧 Email Verification Code
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

            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e6edf3", marginBottom: 6 }}>
                📱 Mobile SMS Code (MSG91)
              </div>
              <input
                className="auth-input"
                placeholder="6-digit mobile OTP"
                type="text"
                maxLength={6}
                value={phoneOtp}
                onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ""))}
                required
                style={{ letterSpacing: 4, fontWeight: 700, fontSize: 15, textAlign: "center" }}
              />
            </div>

            <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Validating..." : "Validate & Log In ✓"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 12 }}>
              <button
                type="button"
                onClick={() => setStep("credentials")}
                style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleResendCode}
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
            Don't have an account?{" "}
            <Link to="/signup" style={{ color: "#60a5fa", fontWeight: 600 }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
