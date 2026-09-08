import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AdminContestPrizesAPI, AdminPrizesAPI, AdminContestsAPI, PrizeConfig, PrizeAward, PrizeSlab } from "../../services/adminApi";

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
  const [poolInput, setPoolInput] = useState("0");
  const [slabInputs, setSlabInputs] = useState<PrizeSlab[]>([{ rankFrom: 1, rankTo: 1, percentage: 100 }]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!id) return;
    AdminContestsAPI.get(id).then((res) => setContest(res.data));
    AdminContestPrizesAPI.getConfig(id).then((res) => {
      setConfig(res.data);
      setPoolInput(res.data.totalPrizePool);
      if (res.data.slabs.length > 0) setSlabInputs(res.data.slabs);
    });
    AdminContestPrizesAPI.listAwards(id).then((res) => setAwards(res.data));
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

  async function savePoolConfig() {
    if (!id) return;
    setBusy(true);
    setMessage(null);
    try {
      await AdminContestPrizesAPI.setConfig(
        id,
        Number(poolInput),
        slabInputs.map((s) => ({ rankFrom: s.rankFrom, rankTo: s.rankTo, percentage: s.percentage }))
      );
      setMessage("Prize pool saved.");
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? "Could not save prize pool");
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
      setMessage(`Awards computed: ${res.data.awardsCreated ?? 0}.`);
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? "Could not compute awards");
    } finally {
      setBusy(false);
    }
  }

  async function recomputeStatus(awardId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await AdminPrizesAPI.recomputeStatus(awardId);
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? "Could not refresh status");
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
      setMessage("Payout released.");
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? "Could not release payout");
    } finally {
      setBusy(false);
    }
  }

  if (!contest || !config) return <div className="container"><div className="card">Loading...</div></div>;

  const slabTotalPct = slabInputs.reduce((sum, s) => sum + Number(s.percentage || 0), 0);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 0 40px" }}>
      {/* Header Banner Card */}
      <div
        style={{
          background: "rgba(13, 17, 28, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 16,
          padding: "24px 28px",
          marginBottom: 24,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <Link
            to={`/admin/contests/${id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "#60a5fa",
              textDecoration: "none",
            }}
          >
            ← Back to {contest.name}
          </Link>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              Prizes &amp; Payout Console
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              {locked
                ? "Prize pool is locked - awards have been computed for this contest."
                : "Set total prize pool and rank slab percentages. Locks automatically upon contest end."}
            </p>
          </div>
          {locked && (
            <span
              style={{
                background: "rgba(168, 85, 247, 0.15)",
                border: "1px solid rgba(168, 85, 247, 0.35)",
                color: "#c084fc",
                padding: "4px 14px",
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              🔒 POOL LOCKED
            </span>
          )}
        </div>

        {message && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(37, 99, 235, 0.15)",
              border: "1px solid rgba(37, 99, 235, 0.3)",
              color: "#60a5fa",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {message}
          </div>
        )}
      </div>

      {/* Prize Pool Config Card */}
      <div
        style={{
          background: "rgba(13, 17, 28, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 16 }}>
          Prize Pool &amp; Distribution Slabs
        </h3>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
            TOTAL PRIZE POOL (₹)
          </label>
          <input
            type="number"
            min={0}
            value={poolInput}
            disabled={locked}
            onChange={(e) => setPoolInput(e.target.value)}
            style={{
              width: 240,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255, 255, 255, 0.12)",
              background: "rgba(255, 255, 255, 0.05)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
            }}
          />
        </div>

        <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Rank Breakdown Slabs</h4>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 16 }}>
          Each slab splits its % of the pool evenly across its rank range. E.g. rank 1-1 = 50%, rank 2-3 = 30% (15% each).
        </p>

        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Rank From</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Rank To</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>% of Pool</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Amount / Winner</th>
                <th style={{ padding: "10px 12px", width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {slabInputs.map((s, idx) => {
                const winners = Math.max(1, s.rankTo - s.rankFrom + 1);
                const amountPerWinner = (Number(poolInput || 0) * (Number(s.percentage || 0) / 100)) / winners;
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <input
                        type="number"
                        min={1}
                        value={s.rankFrom}
                        disabled={locked}
                        onChange={(e) => updateSlab(idx, "rankFrom", Number(e.target.value))}
                        style={{
                          width: 80,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "#fff",
                          fontSize: 13,
                        }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <input
                        type="number"
                        min={1}
                        value={s.rankTo}
                        disabled={locked}
                        onChange={(e) => updateSlab(idx, "rankTo", Number(e.target.value))}
                        style={{
                          width: 80,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "#fff",
                          fontSize: 13,
                        }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={s.percentage}
                        disabled={locked}
                        onChange={(e) => updateSlab(idx, "percentage", Number(e.target.value))}
                        style={{
                          width: 100,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "#fff",
                          fontSize: 13,
                        }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#3fb950" }}>
                      ₹{amountPerWinner.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => removeSlab(idx)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "1px solid rgba(248, 81, 73, 0.3)",
                            background: "rgba(248, 81, 73, 0.1)",
                            color: "#f85149",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!locked && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <button
              type="button"
              onClick={addSlabRow}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(255, 255, 255, 0.05)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Add Slab Row
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: slabTotalPct > 100 ? "#f85149" : "var(--text-secondary)" }}>
              Total Allocated: {slabTotalPct.toFixed(1)}% / 100%
            </span>
          </div>
        )}

        {!locked && (
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={savePoolConfig}
              disabled={busy}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: busy ? "not-allowed" : "pointer",
                boxShadow: "0 4px 16px rgba(37, 99, 235, 0.35)",
              }}
            >
              Save Prize Pool
            </button>
            <button
              type="button"
              onClick={computeAwards}
              disabled={busy || contest.status !== "ENDED"}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: busy || contest.status !== "ENDED" ? "not-allowed" : "pointer",
              }}
            >
              Compute Awards Now
            </button>
          </div>
        )}

        {locked && contest.status === "ENDED" && (
          <div>
            <button
              type="button"
              onClick={computeAwards}
              disabled={busy}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Re-run Compute
            </button>
          </div>
        )}
      </div>

      {/* Winner Payout Table Card */}
      <div
        style={{
          background: "rgba(13, 17, 28, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
            Winner Payout Awards ({awards.length})
          </h3>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                <th style={{ padding: "12px 10px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Rank</th>
                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Winner</th>
                <th style={{ padding: "12px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Gross</th>
                <th style={{ padding: "12px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>TDS</th>
                <th style={{ padding: "12px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Net Payable</th>
                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Preference</th>
                <th style={{ padding: "12px 10px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>KYC</th>
                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Bank Status</th>
                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Payout Status</th>
                <th style={{ padding: "12px 10px", textAlign: "center", width: 100 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {awards.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <td style={{ padding: "12px 10px", textAlign: "center", fontWeight: 800, color: "#fff" }}>#{a.rank}</td>
                  <td style={{ padding: "12px 10px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{a.user.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.user.email}</div>
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 13, color: "var(--text-secondary)" }}>
                    ₹{Number(a.grossAmount).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 13, color: "#f85149" }}>
                    ₹{Number(a.tdsAmount).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right", fontSize: 14, fontWeight: 800, color: "#3fb950" }}>
                    ₹{Number(a.netAmount).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 10px", fontSize: 12, color: "var(--text-secondary)" }}>
                    {a.payoutPreference === "PROP_TRADING" ? "Cash + live unlock" : "Cash withdrawal"}
                    {a.unlockedLiveTradingEligibility && <div style={{ color: "#3fb950", fontSize: 11 }}>Live Unlocked</div>}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "center" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: a.user.kycStatus === "VERIFIED" ? "rgba(63, 185, 80, 0.15)" : "rgba(210, 153, 34, 0.15)",
                        color: a.user.kycStatus === "VERIFIED" ? "#3fb950" : "#d29922",
                      }}
                    >
                      {a.user.kycStatus}
                    </span>
                  </td>
                  <td style={{ padding: "12px 10px", fontSize: 12, color: "var(--text-secondary)" }}>
                    {a.user.verifiedBankAccountCount > 0
                      ? `${a.user.verifiedBankAccountCount} verified${a.payoutAccountLast4 ? ` (••${a.payoutAccountLast4})` : ""}`
                      : "None verified"}
                  </td>
                  <td style={{ padding: "12px 10px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 12,
                        fontWeight: 700,
                        color: STATUS_COLOR[a.payoutStatus] ?? "var(--text-secondary)",
                      }}
                    >
                      {STATUS_LABEL[a.payoutStatus] ?? a.payoutStatus}
                    </span>
                    {a.blockedReason && <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>{a.blockedReason}</div>}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "center" }}>
                    {(a.payoutStatus === "PENDING_KYC" || a.payoutStatus === "PENDING_BANK") && (
                      <button
                        type="button"
                        onClick={() => recomputeStatus(a.id)}
                        disabled={busy}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Refresh
                      </button>
                    )}
                    {a.payoutStatus === "READY" && (
                      <button
                        type="button"
                        onClick={() => release(a.id)}
                        disabled={busy}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 6,
                          border: "none",
                          background: "#3fb950",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Release
                      </button>
                    )}
                    {a.payoutStatus === "FAILED" && (
                      <button
                        type="button"
                        onClick={() => release(a.id)}
                        disabled={busy}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 6,
                          border: "none",
                          background: "#f85149",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {awards.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                    No awards computed for this contest yet.
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

