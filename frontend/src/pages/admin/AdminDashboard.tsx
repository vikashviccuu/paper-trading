import { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { AdminContest, AdminContestsAPI } from "../../services/adminApi";

const DURATIONS = [
  { value: "WEEKLY", label: "Weekly (7 days)" },
  { value: "MONTHLY", label: "Monthly (1 month)" },
  { value: "HALF_YEARLY", label: "Half-yearly (6 months)" },
  { value: "YEARLY", label: "Yearly (12 months)" },
  { value: "CUSTOM", label: "Custom dates" },
] as const;

const STATUS_TABS = ["ALL", "UPCOMING", "ACTIVE", "ENDED", "CANCELLED"] as const;

const CONTEST_STATUS_BADGE: Record<string, { bg: string; border: string; color: string }> = {
  ACTIVE: { bg: "rgba(63, 185, 80, 0.15)", border: "rgba(63, 185, 80, 0.35)", color: "#3fb950" },
  UPCOMING: { bg: "rgba(96, 165, 250, 0.15)", border: "rgba(96, 165, 250, 0.35)", color: "#60a5fa" },
  ENDED: { bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.35)", color: "#c084fc" },
  CANCELLED: { bg: "rgba(248, 81, 73, 0.15)", border: "rgba(248, 81, 73, 0.35)", color: "#f85149" },
};

export default function AdminDashboard() {
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("ALL");
  const [contests, setContests] = useState<AdminContest[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    AdminContestsAPI.list(tab === "ALL" ? undefined : tab).then((res) => setContests(res.data));
  }

  useEffect(load, [tab]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 0 40px" }}>
      {/* Top Banner Card */}
      <div style={{
        background: "rgba(13, 17, 28, 0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 16,
        padding: "24px 28px",
        marginBottom: 24,
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16
      }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            Contest Management
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
            Create, configure, and monitor trading competitions across the platform.
          </p>
        </div>

        <button
          onClick={() => setShowCreate((v) => !v)}
          style={{
            padding: "10px 18px", borderRadius: 10, border: "none",
            background: showCreate ? "rgba(255, 255, 255, 0.08)" : "linear-gradient(135deg, #2563eb, #7c3aed)",
            color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            boxShadow: showCreate ? "none" : "0 4px 16px rgba(37, 99, 235, 0.35)",
            transition: "all 0.15s"
          }}
        >
          {showCreate ? "Cancel Form" : "+ Create New Contest"}
        </button>
      </div>

      {/* Filter Tabs Bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "rgba(255, 255, 255, 0.03)", padding: 4, borderRadius: 10, border: "1px solid var(--border-light)", width: "fit-content" }}>
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            style={{
              padding: "6px 14px", borderRadius: 7, border: "none",
              background: tab === s ? "var(--accent)" : "transparent",
              color: tab === s ? "#fff" : "var(--text-secondary)",
              fontSize: 12, fontWeight: 600, transition: "all 0.15s"
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Create Form Drawer */}
      {showCreate && (
        <CreateContestForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {/* Contests Table Card */}
      <div style={{
        background: "rgba(13, 17, 28, 0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)"
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Contest Name</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Duration</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Status</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Starts</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Ends (Market Close)</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Participants</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contests.map((c) => {
                const badge = CONTEST_STATUS_BADGE[c.status] ?? CONTEST_STATUS_BADGE.ACTIVE;
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <td style={{ padding: "14px 12px", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                      {c.name}
                      {c.description && <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, marginTop: 2 }}>{c.description}</div>}
                    </td>
                    <td style={{ padding: "14px 12px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "rgba(255, 255, 255, 0.05)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                        {c.durationType}
                      </span>
                    </td>
                    <td style={{ padding: "14px 12px" }}>
                      <span style={{
                        padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 800,
                        background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color
                      }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: "14px 12px", fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      {new Date(c.startDate).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "14px 12px", fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                      {new Date(c.endDate).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "14px 12px", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                      {c._count?.participants ?? 0}{c.maxParticipants ? ` / ${c.maxParticipants}` : ""}
                    </td>
                    <td style={{ padding: "14px 12px", textAlign: "right" }}>
                      <Link
                        to={`/admin/contests/${c.id}`}
                        style={{
                          padding: "6px 14px", borderRadius: 8, background: "rgba(37, 99, 235, 0.15)",
                          border: "1px solid rgba(37, 99, 235, 0.3)", color: "#60a5fa",
                          fontSize: 12, fontWeight: 700, textDecoration: "none"
                        }}
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {contests.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                    No contests found in this category.
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

function CreateContestForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationType, setDurationType] = useState<(typeof DURATIONS)[number]["value"]>("WEEKLY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startingCash, setStartingCash] = useState(100000);
  const [maxParticipants, setMaxParticipants] = useState<number | "">("");
  const [returnWeight, setReturnWeight] = useState(0.6);
  const [riskWeight, setRiskWeight] = useState(0.4);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await AdminContestsAPI.create({
        name,
        description,
        durationType,
        startDate: new Date(startDate).toISOString(),
        endDate: durationType === "CUSTOM" ? new Date(endDate).toISOString() : undefined,
        startingVirtualCash: Number(startingCash),
        maxParticipants: maxParticipants === "" ? undefined : Number(maxParticipants),
        returnWeight: Number(returnWeight),
        riskWeight: Number(riskWeight),
      });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Could not create contest");
    }
  }

  return (
    <div style={{
      background: "rgba(13, 17, 28, 0.95)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(37, 99, 235, 0.3)",
      borderRadius: 16,
      padding: 24,
      marginBottom: 24,
      boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)"
    }}>
      <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>Create New Contest</h3>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20 }}>
        Weekly, Monthly, Half-yearly, and Yearly contests get their end date computed automatically from start date, pinned to market close on the final day.
      </p>

      {error && (
        <div style={{ background: "rgba(248, 81, 73, 0.12)", border: "1px solid rgba(248, 81, 73, 0.3)", color: "#f85149", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ gridColumn: "span 2" }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Contest Title</label>
          <input
            placeholder="e.g. September Nifty Options Championship"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
          />
        </div>

        <div style={{ gridColumn: "span 2" }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Description (Optional)</label>
          <input
            placeholder="Brief contest overview..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Duration Type</label>
          <select
            value={durationType}
            onChange={(e) => setDurationType(e.target.value as any)}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
          >
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value} style={{ background: "#0d1117" }}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Start Date & Time</label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
          />
        </div>

        {durationType === "CUSTOM" && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>End Date & Time</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
            />
          </div>
        )}

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Starting Virtual Cash (₹)</label>
          <input
            type="number"
            min={1000}
            value={startingCash}
            onChange={(e) => setStartingCash(Number(e.target.value))}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Max Participants (Optional)</label>
          <input
            type="number"
            min={1}
            value={maxParticipants}
            placeholder="Unlimited if empty"
            onChange={(e) => setMaxParticipants(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Return Score Weight (0.0 to 1.0)</label>
          <input
            type="number"
            step="0.1"
            min={0}
            max={1}
            value={returnWeight}
            onChange={(e) => setReturnWeight(Number(e.target.value))}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Risk Score Weight (0.0 to 1.0)</label>
          <input
            type="number"
            step="0.1"
            min={0}
            max={1}
            value={riskWeight}
            onChange={(e) => setRiskWeight(Number(e.target.value))}
            style={{ width: "100%", padding: "10px 12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }}
          />
        </div>

        <div style={{ gridColumn: "span 2", marginTop: 8 }}>
          <button
            type="submit"
            style={{
              padding: "12px 24px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
              boxShadow: "0 4px 16px rgba(37, 99, 235, 0.4)"
            }}
          >
            Create Contest →
          </button>
        </div>
      </form>
    </div>
  );
}
