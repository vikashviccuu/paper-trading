import { Routes, Route, Navigate, Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "./store/AuthContext";
import { useAdminAuth } from "./store/AdminAuthContext";
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
    <div style={{ minHeight: "100vh", background: "#080b12", display: "flex", flexDirection: "column" }}>
      <nav style={{
        background: "#0d1117", borderBottom: "1px solid #1e2d3d",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 52, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link to="/admin" style={{ fontWeight: 800, color: "#60a5fa", fontSize: 15, textDecoration: "none" }}>Admin Panel</Link>
          {admin && <>
            <Link to="/admin" style={{ color: "#8b949e", fontSize: 13, textDecoration: "none" }}>Contests</Link>
            <Link to="/admin/terminal" style={{ color: "#60a5fa", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Terminal ↗</Link>
            <Link to="/admin/kyc" style={{ color: "#8b949e", fontSize: 13, textDecoration: "none" }}>KYC Review</Link>
            <Link to="/admin/live-trading" style={{ color: "#8b949e", fontSize: 13, textDecoration: "none" }}>Live Trading</Link>
            <Link to="/admin/login-history" style={{ color: "#8b949e", fontSize: 13, textDecoration: "none" }}>Login History</Link>
          </>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {admin && <span style={{ color: "#8b949e", fontSize: 13 }}>{admin.name}</span>}
          {admin && <button onClick={logout} style={{ background: "transparent", border: "1px solid #1e2d3d", color: "#8b949e", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}>Log out</button>}
          <Link to="/" style={{ color: "#475569", fontSize: 12, textDecoration: "none" }}>← Trading App</Link>
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
    <div style={{ minHeight: "100vh", background: "#080b12", display: "flex", flexDirection: "column" }}>
      {/* Modern navbar — hidden on /trade & /terminal (terminal has its own) */}
      {!isTerminal && (
        <nav style={{
          background: "#0d1117",
          borderBottom: "1px solid #1e2d3d",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 0 0 0", height: 52, flexShrink: 0,
          position: "sticky", top: 0, zIndex: 100,
        }}>
          {/* Left: logo + links */}
          <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Link to="/" style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "0 20px", height: "100%",
              borderRight: "1px solid #1e2d3d", textDecoration: "none",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: "linear-gradient(135deg,#1d4ed8,#7c3aed)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 900, fontSize: 12, color: "#fff",
              }}>PT</div>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#e6edf3" }}>PaperTrade</span>
            </Link>
            {user && (
              <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 8px" }}>
                {[
                  { to: "/", label: "Dashboard" },
                  { to: "/trade", label: "Terminal" },
                  { to: "/portfolio", label: "Portfolio" },
                  { to: "/options", label: "Options" },
                  { to: "/contests", label: "Contests" },
                  { to: "/live-trading", label: "Live", red: true },
                  { to: "/profile", label: "Profile" },
                ].map((l) => (
                  <Link key={l.to} to={l.to} style={{
                    padding: "0 14px", height: "100%",
                    display: "flex", alignItems: "center",
                    fontSize: 13, fontWeight: 500, textDecoration: "none",
                    color: (location.pathname === l.to || (l.to === "/trade" && location.pathname === "/terminal")) ? "#60a5fa" : l.red ? "#f85149" : "#8b949e",
                    borderBottom: (location.pathname === l.to || (l.to === "/trade" && location.pathname === "/terminal")) ? "2px solid #2563eb" : "2px solid transparent",
                    transition: "color 0.15s",
                  }}>{l.label}</Link>
                ))}
              </div>
            )}
          </div>

          {/* Right: user info */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
            {user ? (
              <>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "linear-gradient(135deg,#1d4ed8,#7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800, color: "#fff",
                }}>
                  {user.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span style={{ fontSize: 13, color: "#8b949e" }}>{user.name}</span>
                <button onClick={logout} style={{
                  background: "transparent", border: "1px solid #1e2d3d",
                  color: "#8b949e", borderRadius: 6, padding: "5px 12px",
                  cursor: "pointer", fontSize: 12, fontWeight: 500,
                }}>Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" style={{ color: "#8b949e", fontSize: 13 }}>Log in</Link>
                <Link to="/signup" style={{
                  background: "#2563eb", color: "#fff", padding: "6px 14px",
                  borderRadius: 6, fontSize: 13, fontWeight: 600,
                }}>Sign up</Link>
              </>
            )}
            <Link to="/admin/login" style={{ color: "#475569", fontSize: 11, marginLeft: 4 }}>Admin</Link>
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
