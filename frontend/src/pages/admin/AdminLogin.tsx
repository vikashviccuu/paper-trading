import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AdminAuthAPI } from "../../services/adminApi";
import { useAdminAuth } from "../../store/AdminAuthContext";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAdminAuth();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await AdminAuthAPI.login(email, password);
      login(res.data.token, res.data.admin);
      navigate("/admin");
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Admin authentication failed");
    } finally {
      setLoading(false);
    }
  }

  function handleQuickFill() {
    setEmail("admin@example.com");
    setPassword("");
  }

  return (
    <div className="auth-page">
      <div className="auth-bg-blob-1" style={{ background: "radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, rgba(0, 0, 0, 0) 70%)" }} />
      <div className="auth-bg-blob-2" style={{ background: "radial-gradient(circle, rgba(168, 85, 247, 0.22) 0%, rgba(0, 0, 0, 0) 70%)" }} />

      <div className="auth-card" style={{ borderColor: "rgba(139, 92, 246, 0.2)" }}>
        {/* Admin Badge Shield */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 16,
            background: "linear-gradient(135deg, #4f46e5, #9333ea)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", boxShadow: "0 8px 24px rgba(147, 51, 234, 0.35)",
            marginBottom: 14
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            Admin Control Center
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, textAlign: "center" }}>
            Restricted access for contest creation & KYC management
          </p>
        </div>

        {/* Info Banner */}
        <div style={{
          background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)",
          borderRadius: 10, padding: "10px 12px", marginBottom: 20, fontSize: 12, color: "#a5b4fc",
          display: "flex", alignItems: "flex-start", gap: 8
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div>
            Admins are seeded via <code style={{ color: "#c084fc" }}>npm run seed:admin</code>.
            {" "}
            <button
              type="button"
              onClick={handleQuickFill}
              style={{
                background: "none", border: "none", color: "#60a5fa",
                textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: 0
              }}
            >
              Fill admin email
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: "rgba(248, 81, 73, 0.12)", border: "1px solid rgba(248, 81, 73, 0.3)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 20,
            color: "#f85149", fontSize: 13, display: "flex", alignItems: "center", gap: 10
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit}>
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
              placeholder="Admin Email"
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
              placeholder="Admin Password"
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
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          <button className="auth-btn-primary auth-btn-admin" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? "Authenticating Admin..." : "Log In to Admin Portal"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <Link to="/login" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            ← Back to User Login
          </Link>
        </div>
      </div>
    </div>
  );
}
