import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../services/api";

type Phase = "auth" | "syncing" | "done" | "error";

export default function ZerodhaCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("auth");
  const [error, setError] = useState("");
  const [synced, setSynced] = useState<number | null>(null);
  const isExchangingRef = useRef(false);

  useEffect(() => {
    const requestToken = searchParams.get("request_token");
    const status = searchParams.get("status");

    if (!requestToken) {
      setError(`Invalid redirect — token=${requestToken ?? "missing"}`);
      setPhase("error");
      return;
    }

    if (isExchangingRef.current) return;
    isExchangingRef.current = true;

    // Step 1: exchange token
    api.post("/broker/zerodha/exchange", { requestToken })
      .then(() => {
        setPhase("syncing");
        // Step 2: sync instruments in background
        return api.post("/market/sync-instruments-public");
      })
      .then((res) => {
        setSynced(res.data.synced);
        setPhase("done");
        // Redirect to /admin if admin route, else /trade after 1.2s
        const isAdmin = window.location.pathname.includes("/admin");
        setTimeout(() => navigate(isAdmin ? "/admin" : "/trade", { replace: true }), 1200);
      })
      .catch((err) => {
        setError(err.response?.data?.error ?? err.message);
        setPhase("error");
      });
  }, []);

  const steps: { label: string; phase: Phase[] }[] = [
    { label: "Exchange request token", phase: ["syncing", "done"] },
    { label: "Sync instruments", phase: ["done"] },
    { label: "Redirect to terminal", phase: ["done"] },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-base)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "40px 48px", width: 420, textAlign: "center",
      }}>
        {/* Logo */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: "linear-gradient(135deg,#1d4ed8,#7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 16, color: "#fff", margin: "0 auto 20px",
        }}>PT</div>

        {phase !== "error" ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginBottom: 6 }}>
              {phase === "done" ? "Connected to Zerodha" : "Connecting to Zerodha…"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 28 }}>
              {phase === "auth" && "Exchanging access token…"}
              {phase === "syncing" && "Syncing instruments from Kite…"}
              {phase === "done" && `${synced?.toLocaleString("en-IN") ?? ""} instruments synced. Redirecting…`}
            </div>

            {/* Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
              {steps.map((s, i) => {
                const done = s.phase.includes(phase);
                const active = (phase === "auth" && i === 0) || (phase === "syncing" && i === 1);
                return (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800,
                      background: done ? "var(--green-bg)" : active ? "var(--bg-active)" : "var(--bg-elevated)",
                      border: `1px solid ${done ? "var(--green-border)" : active ? "var(--accent)" : "var(--border)"}`,
                      color: done ? "var(--green)" : active ? "#60a5fa" : "var(--text-muted)",
                    }}>
                      {done ? "✓" : i + 1}
                    </div>
                    <span style={{ fontSize: 13, color: done ? "var(--text-primary)" : active ? "var(--text-secondary)" : "var(--text-muted)", fontWeight: done ? 600 : 400 }}>
                      {s.label}
                    </span>
                    {active && (
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)" }}>
                        ●●●
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--red)", marginBottom: 8 }}>Authentication Failed</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>{error}</div>
            <a
              href={typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
                ? "https://kite.zerodha.com/connect/login?api_key=ouuv4g2r3iyafu5c&v=3"
                : "https://kite.zerodha.com/connect/login?api_key=jfwd2gvwal8pq0rp&v=3"}
              style={{
                display: "block", padding: "10px 0", borderRadius: "var(--radius)",
                background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13,
                textDecoration: "none",
              }}
            >
              Re-authenticate with Zerodha →
            </a>
          </>
        )}
      </div>
    </div>
  );
}
