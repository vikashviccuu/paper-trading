import { Routes, Route, Navigate, Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "./store/AuthContext";
import { useAdminAuth } from "./store/AdminAuthContext";
import ThemeSelector from "./components/ThemeSelector";
import ZerodhaCallback from "./pages/ZerodhaCallback";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Trade from "./pages/Trade";
import Portfolio from "./pages/Portfolio";
import OptionsChain from "./pages/OptionsChain";
import Contests from "./pages/Contests";
import ContestDetail from "./pages/ContestDetail";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import LiveTrading from "./pages/LiveTrading";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminContestDetail from "./pages/admin/AdminContestDetail";
import AdminKycQueue from "./pages/admin/AdminKycQueue";
import AdminContestPrizes from "./pages/admin/AdminContestPrizes";
import AdminLiveTrading from "./pages/admin/AdminLiveTrading";
import AdminLoginHistory from "./pages/admin/AdminLoginHistory";

function PrivateRoute({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

function AdminPrivateRoute({ children }: { children: JSX.Element }) {
  const { token } = useAdminAuth();
  return token ? children : <Navigate to="/admin/login" replace />;
}

function AdminApp() {
  const { admin, logout } = useAdminAuth();
  const location = useLocation();
  const isTerminal = location.pathname === "/admin/terminal" || location.pathname === "/admin/trade";

  return (
    <div className="app-shell">
      <nav className="app-nav" style={{ padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link to="/admin" style={{ fontWeight: 800, color: "var(--accent)", fontSize: 15, textDecoration: "none" }}>Admin Panel</Link>
          {admin && <>
            <Link to="/admin" style={{ color: "var(--text-secondary)", fontSize: 13, textDecoration: "none" }}>Contests</Link>
            <Link to="/admin/terminal" style={{ color: "var(--accent)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Terminal ↗</Link>
            <Link to="/admin/kyc" style={{ color: "var(--text-secondary)", fontSize: 13, textDecoration: "none" }}>KYC Review</Link>
            <Link to="/admin/live-trading" style={{ color: "var(--text-secondary)", fontSize: 13, textDecoration: "none" }}>Live Trading</Link>
            <Link to="/admin/login-history" style={{ color: "var(--text-secondary)", fontSize: 13, textDecoration: "none" }}>Login History</Link>
          </>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeSelector />
          {admin && <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{admin.name}</span>}
          {admin && <button onClick={logout} className="app-btn-outline">Log out</button>}
          <Link to="/" style={{ color: "var(--text-muted)", fontSize: 12, textDecoration: "none" }}>← Trading App</Link>
        </div>
      </nav>
      <div style={{ flex: 1, overflow: isTerminal ? "hidden" : "auto", maxWidth: isTerminal ? "100%" : 1100, margin: isTerminal ? 0 : "0 auto", width: "100%", padding: isTerminal ? 0 : "24px 16px" }}>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/zerodha/callback" element={<ZerodhaCallback />} />
          <Route path="/admin" element={<AdminPrivateRoute><AdminDashboard /></AdminPrivateRoute>} />
          <Route path="/admin/terminal" element={<AdminPrivateRoute><Trade /></AdminPrivateRoute>} />
          <Route path="/admin/trade" element={<AdminPrivateRoute><Trade /></AdminPrivateRoute>} />
          <Route path="/admin/contests/:id" element={<AdminPrivateRoute><AdminContestDetail /></AdminPrivateRoute>} />
          <Route path="/admin/contests/:id/prizes" element={<AdminPrivateRoute><AdminContestPrizes /></AdminPrivateRoute>} />
          <Route path="/admin/kyc" element={<AdminPrivateRoute><AdminKycQueue /></AdminPrivateRoute>} />
          <Route path="/admin/live-trading" element={<AdminPrivateRoute><AdminLiveTrading /></AdminPrivateRoute>} />
          <Route path="/admin/login-history" element={<AdminPrivateRoute><AdminLoginHistory /></AdminPrivateRoute>} />
        </Routes>
      </div>
    </div>
  );
}


function UserApp() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isTerminal = location.pathname === "/trade" || location.pathname === "/terminal";

  return (
    <div className="app-shell">
      {/* Modern navbar — hidden on /trade & /terminal (terminal has its own) */}
      {!isTerminal && (
        <nav className="app-nav">
          {/* Left: logo + links */}
          <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Link to="/" className="app-nav-logo">
              <div className="app-nav-logo-icon">PT</div>
              <span className="app-nav-logo-title">PaperTrade</span>
            </Link>
            {user && (
              <div className="app-nav-links">
                {[
                  { to: "/", label: "Dashboard" },
                  { to: "/trade", label: "Terminal" },
                  { to: "/portfolio", label: "Portfolio" },
                  { to: "/options", label: "Options" },
                  { to: "/contests", label: "Contests" },
                  { to: "/live-trading", label: "Live", red: true },
                  { to: "/profile", label: "Profile" },
                ].map((l) => {
                  const isActive = location.pathname === l.to || (l.to === "/trade" && location.pathname === "/terminal");
                  return (
                    <Link
                      key={l.to}
                      to={l.to}
                      className={`app-nav-link ${isActive ? "active" : ""} ${l.red ? "live" : ""}`}
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: theme selector + user info */}
          <div className="app-nav-right">
            <ThemeSelector />
            {user ? (
              <>
                <div className="app-user-avatar">
                  {user.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="app-user-name">{user.name}</span>
                <button onClick={logout} className="app-btn-outline">Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" style={{ color: "var(--text-secondary)", fontSize: 13 }}>Log in</Link>
                <Link to="/signup" style={{
                  background: "var(--accent)", color: "#fff", padding: "6px 14px",
                  borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none"
                }}>Sign up</Link>
              </>
            )}
            <Link to="/admin/login" style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 4 }}>Admin</Link>
          </div>
        </nav>
      )}

      {/* Page content */}
      <div style={{ flex: 1, overflow: isTerminal ? "hidden" : "auto" }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/zerodha/callback" element={<ZerodhaCallback />} />
          <Route path="/broker/zerodha/callback" element={<ZerodhaCallback />} />
          <Route path="/trade/broker/zerodha/callback" element={<ZerodhaCallback />} />
          <Route path="/admin/zerodha/callback" element={<ZerodhaCallback />} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/trade" element={<PrivateRoute><Trade /></PrivateRoute>} />
          <Route path="/terminal" element={<PrivateRoute><Trade /></PrivateRoute>} />
          <Route path="/portfolio" element={<PrivateRoute><Portfolio /></PrivateRoute>} />
          <Route path="/options" element={<PrivateRoute><OptionsChain /></PrivateRoute>} />
          <Route path="/contests" element={<PrivateRoute><Contests /></PrivateRoute>} />
          <Route path="/contests/:id" element={<PrivateRoute><ContestDetail /></PrivateRoute>} />
          <Route path="/contests/:id/leaderboard" element={<PrivateRoute><Leaderboard /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/live-trading" element={<PrivateRoute><LiveTrading /></PrivateRoute>} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Intercept Zerodha redirect on ANY path (/admin/zerodha/callback?request_token=... or /trade?request_token=...)
  if (searchParams.get("request_token")) {
    return <ZerodhaCallback />;
  }
  return location.pathname.startsWith("/admin") ? <AdminApp /> : <UserApp />;
}
