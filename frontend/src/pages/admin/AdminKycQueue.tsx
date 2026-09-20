import { useEffect, useState } from "react";
import { AdminKycAPI, AdminKycEntry, adminApi } from "../../services/adminApi";

const KYC_STATUS_BADGE: Record<string, { label: string; bg: string; border: string; color: string }> = {
  SUBMITTED: { label: "SUBMITTED", bg: "rgba(96, 165, 250, 0.15)", border: "rgba(96, 165, 250, 0.35)", color: "#60a5fa" },
  UNDER_REVIEW: { label: "UNDER REVIEW", bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.35)", color: "#c084fc" },
  VERIFIED: { label: "VERIFIED", bg: "rgba(63, 185, 80, 0.15)", border: "rgba(63, 185, 80, 0.35)", color: "#3fb950" },
  REJECTED: { label: "REJECTED", bg: "rgba(248, 81, 73, 0.15)", border: "rgba(248, 81, 73, 0.35)", color: "#f85149" },
  DOCUMENTS_PENDING: { label: "PENDING DOCS", bg: "rgba(210, 153, 34, 0.15)", border: "rgba(210, 153, 34, 0.35)", color: "#d29922" },
};

export default function AdminKycQueue() {
  const [entries, setEntries] = useState<AdminKycEntry[]>([]);
  const [selected, setSelected] = useState<AdminKycEntry | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    AdminKycAPI.pending().then((res) => setEntries(res.data));
  }

  useEffect(load, []);

  async function viewDoc(userId: string, docId: string) {
    try {
      const res = await adminApi.get(`/admin/kyc/${userId}/documents/${docId}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch {
      alert("Could not open document file.");
    }
  }

  async function approve(userId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await AdminKycAPI.approve(userId);
      setMessage({ text: "KYC approved successfully.", type: "success" });
      setSelected(null);
      load();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.error ?? "Could not approve KYC", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function reject(userId: string) {
    if (!rejectReason.trim()) {
      setMessage({ text: "Please enter a rejection reason first.", type: "error" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await AdminKycAPI.reject(userId, rejectReason);
      setMessage({ text: "KYC rejected.", type: "success" });
      setSelected(null);
      setRejectReason("");
      load();
    } catch (err: any) {
      setMessage({ text: err.response?.data?.error ?? "Could not reject KYC", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 0 40px" }}>
      {/* Header Banner Card */}
      <div style={{
        background: "var(--bg-surface)",
        backdropFilter: "blur(16px)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "24px 28px",
        marginBottom: 24,
        boxShadow: "var(--card-shadow)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
              KYC Review Queue
            </h2>
            <span style={{
              background: "rgba(37, 99, 235, 0.15)", border: "1px solid var(--border)",
              padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: "#60a5fa"
            }}>
              {entries.length} PENDING SUBMISSIONS
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Trader PAN & identity document submissions awaiting admin verification, oldest first.
          </p>
        </div>
      </div>

      {/* Global Alert Message */}
      {message && (
        <div style={{
          background: message.type === "success" ? "rgba(63, 185, 80, 0.12)" : "rgba(248, 81, 73, 0.12)",
          border: `1px solid ${message.type === "success" ? "rgba(63, 185, 80, 0.3)" : "rgba(248, 81, 73, 0.3)"}`,
          color: message.type === "success" ? "#3fb950" : "#f85149",
          borderRadius: 12, padding: "12px 18px", marginBottom: 20, fontSize: 13, fontWeight: 600
        }}>
          {message.text}
        </div>
      )}

      {/* Grid: Queue Table + Selected Application Review Drawer */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1.3fr 1fr" : "1fr", gap: 24 }}>
        {/* Submissions Table Card */}
        <div style={{
          background: "var(--bg-surface)",
          backdropFilter: "blur(16px)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "var(--card-shadow)"
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Trader</th>
                  <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>PAN Verification</th>
                  <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const badge = KYC_STATUS_BADGE[e.status] ?? KYC_STATUS_BADGE.SUBMITTED;
                  const isSelected = selected?.id === e.id;

                  return (
                    <tr
                      key={e.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                        transition: "background 0.15s"
                      }}
                    >
                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: 12, color: "#fff", flexShrink: 0
                          }}>
                            {e.user.name?.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{e.user.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.user.email}</div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "12px" }}>
                        {e.panVerified ? (
                          <span style={{
                            padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                            background: "rgba(63, 185, 80, 0.15)", color: "#3fb950", fontFamily: "var(--font-mono)"
                          }}>
                            {e.panNumber} ✓ VERIFIED
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{e.panNumber ?? "No PAN"}</span>
                        )}
                      </td>

                      <td style={{ padding: "12px" }}>
                        <span style={{
                          padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 800,
                          background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color
                        }}>
                          {badge.label}
                        </span>
                      </td>

                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <button
                          onClick={() => setSelected(e)}
                          style={{
                            padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border-light)",
                            background: isSelected ? "var(--accent)" : "rgba(255, 255, 255, 0.04)",
                            color: isSelected ? "#fff" : "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer"
                          }}
                        >
                          Review Application →
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {entries.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                      No KYC submissions currently pending review.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Application Review Drawer */}
        {selected && (
          <div style={{
            background: "var(--bg-surface)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 24,
            boxShadow: "var(--card-shadow)",
            height: "fit-content"
          }}>
            {/* Header / Close */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{selected.user.name}</h3>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{selected.user.email}</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* PAN Card Status Box */}
            <div style={{
              background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-light)",
              borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 13
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>PAN Card Details</div>
              <div style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontSize: 14 }}>
                {selected.panNumber ?? "Not Provided"}
                {selected.panVerified && <span style={{ color: "#3fb950", fontSize: 12, marginLeft: 8 }}>✓ Verified</span>}
              </div>
            </div>

            {/* Documents List */}
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>Uploaded Documents</div>
            <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              {selected.documents.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-light)",
                    borderRadius: 8, padding: "8px 12px", fontSize: 12
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{d.type.replace("_", " ")}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.originalFileName}</div>
                  </div>
                  <button
                    onClick={() => viewDoc(selected.userId, d.id)}
                    style={{
                      padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-light)",
                      background: "rgba(37, 99, 235, 0.15)", color: "#60a5fa", fontSize: 11, fontWeight: 600, cursor: "pointer"
                    }}
                  >
                    View File ↗
                  </button>
                </div>
              ))}

              {selected.documents.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>No document files uploaded.</div>
              )}
            </div>

            {/* Approve Action */}
            <div style={{ marginBottom: 16 }}>
              <button
                onClick={() => approve(selected.userId)}
                disabled={busy}
                style={{
                  width: "100%", padding: "11px", borderRadius: 10, border: "none",
                  background: "linear-gradient(135deg, #059669, #10b981)",
                  color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)"
                }}
              >
                Approve KYC Application ✓
              </button>
            </div>

            {/* Reject Action */}
            <div style={{ background: "rgba(248, 81, 73, 0.06)", border: "1px solid rgba(248, 81, 73, 0.2)", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f85149", textTransform: "uppercase", marginBottom: 6 }}>Reject Application</div>
              <input
                placeholder="Enter rejection reason..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", background: "rgba(0, 0, 0, 0.2)",
                  border: "1px solid var(--border-light)", borderRadius: 6,
                  color: "var(--text-primary)", fontSize: 12, outline: "none", marginBottom: 8
                }}
              />
              <button
                onClick={() => reject(selected.userId)}
                disabled={busy}
                style={{
                  width: "100%", padding: "8px", borderRadius: 6, border: "none",
                  background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer"
                }}
              >
                Reject KYC
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
