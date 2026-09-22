import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AdminContestPrizesAPI, AdminPrizesAPI, AdminContestsAPI, PrizeConfig, PrizeAward, PrizeSlab } from "../../services/adminApi";
import { adminApi } from "../../services/adminApi";

const STATUS_LABEL: Record<string, string> = {
  PENDING_KYC: "Waiting on KYC",
  PENDING_BANK: "Waiting on bank verification",
  READY: "Ready to release",
  PROCESSING: "Processing",
  PAID: "Paid",
  CREDITED_TO_WALLET: "Credited to wallet",
  FAILED: "Failed",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_KYC: "#d29922",
  PENDING_BANK: "#d29922",
  READY: "#2f81f7",
  PROCESSING: "#2f81f7",
  PAID: "#3fb950",
  CREDITED_TO_WALLET: "#3fb950",
  FAILED: "#f85149",
};

/** Shared input style using CSS variables so it adapts to every theme */
const inputStyle = (width: number | string = "100%", extra?: React.CSSProperties): React.CSSProperties => ({
  width,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: 14,
  fontWeight: 600,
  outline: "none",
  transition: "border-color 0.15s",
  ...extra,
});

/**
 * Contest-scoped prize pool config + admin payout console. Before awards
 * are computed (Contest.prizesComputedAt is null), the admin can freely set
 * the total pool and rank slabs. Once computed (normally automatic when
 * ContestEndService ends the contest), the pool/slabs lock and this page
 * shows the per-winner award table instead - gross/TDS/net breakdown, each
 * winner's live KYC + bank verification status, and a Release button.
 * See docs/PRIZES_AND_PAYOUTS.md.
 */
export default function AdminContestPrizes() {
  const { id } = useParams<{ id: string }>();
  const [contest, setContest] = useState<any>(null);
  const [config, setConfig] = useState<PrizeConfig | null>(null);
  const [awards, setAwards] = useState<PrizeAward[]>([]);
  const [poolInput, setPoolInput] = useState("10000");
  const [slabInputs, setSlabInputs] = useState<PrizeSlab[]>([{ rankFrom: 1, rankTo: 1, percentage: 100 }]);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [recomputingScores, setRecomputingScores] = useState(false);

  function load() {
    if (!id) return;
    AdminContestsAPI.get(id).then((res) => setContest(res.data));
    AdminContestPrizesAPI.getConfig(id).then((res) => {
      setConfig(res.data);
      // Only update poolInput if there's an actual pool set
      const pool = Number(res.data.totalPrizePool);
      setPoolInput(pool > 0 ? String(pool) : "10000");
      if (res.data.slabs.length > 0) setSlabInputs(res.data.slabs);
    });
    AdminContestPrizesAPI.listAwards(id).then((res) => setAwards(res.data)).catch(() => {});
  }

  useEffect(load, [id]);

  const locked = !!config?.prizesComputedAt;

  function addSlabRow() {
    setSlabInputs((rows) => [...rows, { rankFrom: rows.length + 1, rankTo: rows.length + 1, percentage: 0 }]);
  }

  function updateSlab(idx: number, field: keyof PrizeSlab, value: number) {
    setSlabInputs((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function removeSlab(idx: number) {
    setSlabInputs((rows) => rows.filter((_, i) => i !== idx));
  }

  const slabTotalPct = slabInputs.reduce((sum, s) => sum + Number(s.percentage || 0), 0);
  const slabsValid = slabInputs.length === 0 || (slabTotalPct > 0 && slabTotalPct <= 100.001);
  const poolValid = Number(poolInput) >= 0;

  async function savePoolConfig() {
    if (!id) return;

    // Client-side validation
    if (!poolValid) {
      setMessage({ text: "Prize pool must be a non-negative number.", type: "error" });
      return;
    }
    if (slabInputs.length > 0) {
      if (slabTotalPct > 100.001) {
        setMessage({ text: `Slabs total ${slabTotalPct.toFixed(1)}% — cannot exceed 100%.`, type: "error" });
        return;
      }
      for (const s of slabInputs) {
        if (s.percentage <= 0) {
          setMessage({ text: `All slab percentages must be greater than 0%.`, type: "error" });
          return;
        }
        if (s.rankFrom > s.rankTo) {
          setMessage({ text: `Rank From (${s.rankFrom}) cannot be greater than Rank To (${s.rankTo}).`, type: "error" });
          return;
        }
      }
    }

    setBusy(true);
    setMessage(null);
    try {
      await AdminContestPrizesAPI.setConfig(
        id,
        Number(poolInput),
        slabInputs.map((s) => ({ rankFrom: s.rankFrom, rankTo: s.rankTo, percentage: s.percentage }))
      );
      setMessage({ text: "✓ Prize pool & slabs saved successfully.", type: "success" });
      load();
    } catch (err: any) {
      const errMsg = err.response?.data?.error;
      const detail = typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg ?? "Could not save prize pool");
      setMessage({ text: `✗ ${detail}`, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function computeAwards() {
    if (!id) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await AdminContestPrizesAPI.compute(id);
      setMessage({ text: `✓ Awards computed: ${res.data.awardsCreated ?? 0} winner(s).`, type: "success" });
      load();
    } catch (err: any) {
      setMessage({ text: `✗ ${err.response?.data?.error ?? "Could not compute awards"}`, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function recomputeScores() {
    if (!id) return;
    setRecomputingScores(true);
    setMessage(null);
    try {
      const res = await adminApi.post<{ recomputed: number }>(`/admin/contests/${id}/recompute-scores`);
      setMessage({ text: `✓ Scores recomputed for ${res.data.recomputed} participant(s).`, type: "success" });
    } catch (err: any) {
      setMessage({ text: `✗ ${err.response?.data?.error ?? "Could not recompute scores"}`, type: "error" });
    } finally {
      setRecomputingScores(false);
    }
  }

  async function recomputeStatus(awardId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await AdminPrizesAPI.recomputeStatus(awardId);
      setMessage({ text: "✓ Award status refreshed.", type: "success" });
      load();
    } catch (err: any) {
      setMessage({ text: `✗ ${err.response?.data?.error ?? "Could not refresh status"}`, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function release(awardId: string) {
    if (!confirm("Release this payout now? This cannot be undone.")) return;
    setBusy(true);
    setMessage(null);
    try {
      await AdminPrizesAPI.release(awardId);
      setMessage({ text: "✓ Payout released successfully.", type: "success" });
      load();
    } catch (err: any) {
      setMessage({ text: `✗ ${err.response?.data?.error ?? "Could not release payout"}`, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (!contest || !config) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 32, textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
          Loading prize configuration...
        </div>
      </div>
    );
  }

  const totalPool = Number(poolInput || 0);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 0 40px" }}>

      {/* ── Header Banner ─────────────────────────────────────── */}
      <div style={{ background: "var(--bg-surface)", backdropFilter: "blur(16px)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px 28px", marginBottom: 24, boxShadow: "var(--card-shadow)" }}>
        <div style={{ marginBottom: 12 }}>
          <Link to={`/admin/contests/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
            ← Back to {contest.name}
          </Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
              🏆 Prizes &amp; Payout Console
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              {locked
                ? "Prize pool is locked — awards have been computed for this contest."
                : "Set total prize pool and rank slab percentages. Locks automatically upon contest end."}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* Recompute Scores button - useful for fixing stale zeros */}
            <button
              type="button"
              onClick={recomputeScores}
              disabled={recomputingScores}
              title="Force-recompute leaderboard scores (Return %, Risk, Composite Score) for all participants"
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontWeight: 600, fontSize: 12, cursor: recomputingScores ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: recomputingScores ? "spin 0.8s linear infinite" : "none" }}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {recomputingScores ? "Recomputing..." : "Recompute Scores"}
            </button>

            {locked && (
              <span style={{ background: "rgba(168, 85, 247, 0.15)", border: "1px solid rgba(168, 85, 247, 0.35)", color: "#c084fc", padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                🔒 POOL LOCKED
              </span>
            )}
          </div>
        </div>

        {/* Message banner */}
        {message && (
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: message.type === "success" ? "rgba(22, 163, 74, 0.12)" : "rgba(239, 68, 68, 0.12)", border: `1px solid ${message.type === "success" ? "rgba(22,163,74,0.3)" : "rgba(239,68,68,0.3)"}`, color: message.type === "success" ? "var(--green)" : "var(--red)", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            {message.text}
            <button onClick={() => setMessage(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        )}
      </div>

      {/* ── Prize Pool Config Card ─────────────────────────────── */}
      <div style={{ background: "var(--bg-surface)", backdropFilter: "blur(16px)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: "var(--card-shadow)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginBottom: 20 }}>
          Prize Pool &amp; Distribution Slabs
        </h3>

        {/* Total pool input */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Total Prize Pool (₹)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontSize: 15, fontWeight: 600, pointerEvents: "none" }}>₹</span>
              <input
                type="number"
                min={0}
                step={100}
                value={poolInput}
                disabled={locked}
                onChange={(e) => setPoolInput(e.target.value)}
                style={{ ...inputStyle(220, { paddingLeft: 28, fontSize: 18, fontWeight: 800, opacity: locked ? 0.6 : 1 }) }}
              />
            </div>
            {totalPool > 0 && (
              <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
                = ₹{totalPool.toLocaleString("en-IN")}
              </span>
            )}
          </div>
        </div>

        {/* Slabs */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>Rank Breakdown Slabs</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              Each slab splits its % of the pool evenly across its rank range. E.g. rank 1–1 = 50%, rank 2–3 = 30% (15% each).
            </p>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: slabTotalPct > 100 ? "var(--red)" : slabTotalPct === 100 ? "var(--green)" : "var(--text-secondary)", whiteSpace: "nowrap" }}>
            Allocated: {slabTotalPct.toFixed(1)}% / 100%
          </span>
        </div>

        <div style={{ overflowX: "auto", marginBottom: 16, borderRadius: 10, border: "1px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Rank From</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Rank To</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>% of Pool</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Amount / Winner</th>
                {!locked && <th style={{ padding: "10px 14px", width: 80 }} />}
              </tr>
            </thead>
            <tbody>
              {slabInputs.map((s, idx) => {
                const winners = Math.max(1, s.rankTo - s.rankFrom + 1);
                const amountPerWinner = (totalPool * (Number(s.percentage || 0) / 100)) / winners;
                const hasError = s.percentage <= 0 || s.rankFrom > s.rankTo;
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: hasError ? "rgba(239,68,68,0.04)" : "transparent", transition: "background 0.1s" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <input
                        type="number"
                        min={1}
                        value={s.rankFrom}
                        disabled={locked}
                        onChange={(e) => updateSlab(idx, "rankFrom", Number(e.target.value))}
                        style={inputStyle(90, { textAlign: "center", opacity: locked ? 0.6 : 1, borderColor: s.rankFrom > s.rankTo ? "var(--red)" : undefined })}
                      />
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <input
                        type="number"
                        min={1}
                        value={s.rankTo}
                        disabled={locked}
                        onChange={(e) => updateSlab(idx, "rankTo", Number(e.target.value))}
                        style={inputStyle(90, { textAlign: "center", opacity: locked ? 0.6 : 1, borderColor: s.rankFrom > s.rankTo ? "var(--red)" : undefined })}
                      />
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="number"
                          min={0.1}
                          max={100}
                          step={0.5}
                          value={s.percentage}
                          disabled={locked}
                          onChange={(e) => updateSlab(idx, "percentage", Number(e.target.value))}
                          style={inputStyle(100, { textAlign: "center", opacity: locked ? 0.6 : 1, borderColor: s.percentage <= 0 ? "var(--red)" : undefined })}
                        />
                        <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 14, fontWeight: 800, color: "var(--green)" }}>
                      ₹{amountPerWinner.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                    {!locked && (
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => removeSlab(idx)}
                          title="Remove this slab"
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "var(--red)", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {slabInputs.length === 0 && (
                <tr>
                  <td colSpan={locked ? 4 : 5} style={{ padding: "24px 14px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                    No slabs configured. Add a slab row below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!locked && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={addSlabRow}
              style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}
            >
              + Add Slab Row
            </button>

            <div style={{ flex: 1 }} />

            <button
              type="button"
              onClick={savePoolConfig}
              disabled={busy}
              style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: busy ? "not-allowed" : "pointer", boxShadow: "0 4px 16px rgba(37,99,235,0.35)", opacity: busy ? 0.7 : 1, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8 }}
            >
              {busy ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  Saving...
                </>
              ) : "💾 Save Prize Pool"}
            </button>

            <button
              type="button"
              onClick={computeAwards}
              disabled={busy || contest.status !== "ENDED"}
              title={contest.status !== "ENDED" ? "Can only compute awards after contest ends" : "Compute winner awards from current pool and slabs"}
              style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: contest.status !== "ENDED" ? "var(--text-muted)" : "var(--text-primary)", fontWeight: 700, fontSize: 13, cursor: busy || contest.status !== "ENDED" ? "not-allowed" : "pointer", opacity: contest.status !== "ENDED" ? 0.6 : 1, transition: "all 0.15s" }}
            >
              Compute Awards Now
            </button>
          </div>
        )}

        {locked && contest.status === "ENDED" && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={computeAwards}
              disabled={busy}
              style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontWeight: 700, fontSize: 13, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1, transition: "all 0.15s" }}
            >
              Re-run Compute Awards
            </button>
          </div>
        )}
      </div>

      {/* ── Winner Payout Table ────────────────────────────────── */}
      <div style={{ background: "var(--bg-surface)", backdropFilter: "blur(16px)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, boxShadow: "var(--card-shadow)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
            Winner Payout Awards
            <span style={{ marginLeft: 10, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "2px 10px", borderRadius: 99, fontSize: 13, fontWeight: 600 }}>
              {awards.length}
            </span>
          </h3>
        </div>

        <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
                {["Rank", "Winner", "Gross", "TDS", "Net Payable", "Preference", "KYC", "Bank", "Payout Status", "Action"].map((h, i) => (
                  <th key={i} style={{ padding: "12px 10px", textAlign: i <= 1 || i === 9 ? "center" : i >= 2 && i <= 4 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {awards.map((a, rowIdx) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)", background: rowIdx % 2 === 0 ? "transparent" : "var(--bg-hover, rgba(0,0,0,0.02))", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = rowIdx % 2 === 0 ? "transparent" : "var(--bg-hover, rgba(0,0,0,0.02))")}
                >
                  <td style={{ padding: "12px 10px", textAlign: "center" }}>
                    <span style={{ fontWeight: 800, color: a.rank === 1 ? "#f59e0b" : a.rank === 2 ? "#94a3b8" : a.rank === 3 ? "#b45309" : "var(--text-primary)", fontSize: 14 }}>
                      {a.rank === 1 ? "🥇" : a.rank === 2 ? "🥈" : a.rank === 3 ? "🥉" : `#${a.rank}`}
                    </span>
                  </td>
                  <td style={{ padding: "12px 10px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{a.user.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.user.email}</div>
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
                    ₹{Number(a.grossAmount).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 13, color: "var(--red)", fontWeight: 600 }}>
                    −₹{Number(a.tdsAmount).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 15, fontWeight: 800, color: "var(--green)" }}>
                    ₹{Number(a.netAmount).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 10px", fontSize: 12, color: "var(--text-secondary)" }}>
                    {a.payoutPreference === "PROP_TRADING" ? "Cash + live unlock" : "Cash withdrawal"}
                    {a.unlockedLiveTradingEligibility && <div style={{ color: "var(--green)", fontSize: 11, marginTop: 2 }}>✓ Live Unlocked</div>}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "center" }}>
                    <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: a.user.kycStatus === "VERIFIED" ? "rgba(22,163,74,0.12)" : "rgba(217,119,6,0.12)", color: a.user.kycStatus === "VERIFIED" ? "var(--green)" : "var(--yellow)" }}>
                      {a.user.kycStatus}
                    </span>
                  </td>
                  <td style={{ padding: "12px 10px", fontSize: 12, color: "var(--text-secondary)" }}>
                    {a.user.verifiedBankAccountCount > 0
                      ? `${a.user.verifiedBankAccountCount} verified${a.payoutAccountLast4 ? ` (••${a.payoutAccountLast4})` : ""}`
                      : <span style={{ color: "var(--red)", fontWeight: 600 }}>None verified</span>}
                  </td>
                  <td style={{ padding: "12px 10px" }}>
                    <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: STATUS_COLOR[a.payoutStatus] ?? "var(--text-secondary)" }}>
                      ● {STATUS_LABEL[a.payoutStatus] ?? a.payoutStatus}
                    </span>
                    {a.blockedReason && <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 2 }}>{a.blockedReason}</div>}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "center" }}>
                    {(a.payoutStatus === "PENDING_KYC" || a.payoutStatus === "PENDING_BANK") && (
                      <button type="button" onClick={() => recomputeStatus(a.id)} disabled={busy}
                        style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                        Refresh
                      </button>
                    )}
                    {a.payoutStatus === "READY" && (
                      <button type="button" onClick={() => release(a.id)} disabled={busy}
                        style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "var(--green)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(22,163,74,0.3)", transition: "all 0.15s" }}>
                        Release
                      </button>
                    )}
                    {a.payoutStatus === "FAILED" && (
                      <button type="button" onClick={() => release(a.id)} disabled={busy}
                        style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "var(--red)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {awards.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: "48px 14px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
                    No awards computed for this contest yet.
                    {contest.status !== "ENDED" && (
                      <div style={{ marginTop: 6, fontSize: 12 }}>Awards can be computed once the contest ends.</div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
