import { useEffect, useState } from "react";
import {
  AdminLoginHistoryAPI,
  AdminLoginAuditItem,
  AdminSecurityStats,
  UserSecurityOverview,
} from "../../services/adminApi";

export default function AdminLoginHistory() {
  const [items, setItems] = useState<AdminLoginAuditItem[]>([]);
  const [stats, setStats] = useState<AdminSecurityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [isSuspicious, setIsSuspicious] = useState<boolean | undefined>(undefined);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // User Security Inspection Modal
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);
  const [userOverview, setUserOverview] = useState<UserSecurityOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  async function loadData(p = 1) {
    setLoading(true);
    try {
      const [historyRes, statsRes] = await Promise.all([
        AdminLoginHistoryAPI.list({
          page: p,
          limit: 20,
          search: search || undefined,
          status: status || undefined,
          isSuspicious,
        }),
        AdminLoginHistoryAPI.getStats(),
      ]);

      setItems(historyRes.data.items || []);
      setTotal(historyRes.data.total || 0);
      setTotalPages(historyRes.data.totalPages || 1);
      setPage(p);
      setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to load admin login history:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(1);
  }, [status, isSuspicious]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadData(1);
  }

  async function openUserInspection(userId: string) {
    setInspectUserId(userId);
    setLoadingOverview(true);
    try {
      const res = await AdminLoginHistoryAPI.getUserDetail(userId);
      setUserOverview(res.data);
    } catch (err) {
      console.error("Failed to load user security overview:", err);
    } finally {
      setLoadingOverview(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      {/* Page Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 16
      }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 10 }}>
            <span>🛡️</span> User Login History &amp; Security Audits
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
            Monitor real-time user authentication events, network IP addresses, persistent client device IDs, and suspicious access attempts.
          </p>
        </div>
        <button
          onClick={() => loadData(page)}
          disabled={loading}
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>🔄</span> {loading ? "Refreshing..." : "Refresh Audit"}
        </button>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}>
          <div style={{
            background: "var(--bg-surface)", boxShadow: "var(--card-shadow)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 18px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              24h Total Logins
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#60a5fa", marginTop: 6 }}>
              {stats.total24h.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              7d: {stats.total7d.toLocaleString()}
            </div>
          </div>

          <div style={{
            background: "var(--bg-surface)", boxShadow: "var(--card-shadow)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 18px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              24h Successful
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#3fb950", marginTop: 6 }}>
              {stats.success24h.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Authorized access
            </div>
          </div>

          <div style={{
            background: "var(--bg-surface)", boxShadow: "var(--card-shadow)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 18px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              24h Failed Logins
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: stats.failed24h > 0 ? "var(--red)" : "var(--text-secondary)", marginTop: 6 }}>
              {stats.failed24h.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Failure rate: {stats.failureRate24h}%
            </div>
          </div>

          <div style={{
            background: "var(--bg-surface)", boxShadow: "var(--card-shadow)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 18px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Unique Active Devices
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#a78bfa", marginTop: 6 }}>
              {stats.uniqueDevicesCount.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Distinct hardware fingerprints
            </div>
          </div>

          <div style={{
            background: "var(--bg-surface)", boxShadow: "var(--card-shadow)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 18px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Unique IP Networks
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#38bdf8", marginTop: 6 }}>
              {stats.uniqueIpsCount.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Public &amp; local subnets
            </div>
          </div>

          <div style={{
            background: "var(--bg-surface)", boxShadow: "var(--card-shadow)",
            border: stats.suspiciousCount > 0 ? "1px solid var(--red-border)" : "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 18px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Suspicious Activity
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: stats.suspiciousCount > 0 ? "#f85149" : "#3fb950", marginTop: 6 }}>
              {stats.suspiciousCount.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Repeated failed attempts
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{
        background: "var(--bg-surface)", boxShadow: "var(--card-shadow)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        {/* Search form */}
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 260 }}>
          <input
            type="text"
            placeholder="Search by user name, email, IP address, device ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "9px 14px",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              background: "#2563eb",
              border: "none",
              color: "#fff",
              borderRadius: 8,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTimeout(() => loadData(1), 0);
              }}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                borderRadius: 8,
                padding: "9px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </form>

        {/* Status filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "9px 12px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <option value="">All Statuses</option>
            <option value="SUCCESS">Success Only</option>
            <option value="FAILED">Failed Only</option>
            <option value="BLOCKED">Blocked Only</option>
          </select>

          <button
            type="button"
            onClick={() => setIsSuspicious(isSuspicious === true ? undefined : true)}
            style={{
              background: isSuspicious ? "var(--red-bg)" : "var(--bg-elevated)",
              border: `1px solid ${isSuspicious ? "var(--red)" : "var(--border)"}`,
              color: isSuspicious ? "var(--red)" : "var(--text-secondary)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>⚠️</span> Suspicious Only
          </button>
        </div>
      </div>

      {/* Copy toast feedback */}
      {copiedText && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: "#238636",
          color: "#fff",
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          zIndex: 9999,
        }}>
          ✓ Copied {copiedText} to clipboard!
        </div>
      )}

      {/* Main Audit Table */}
      <div style={{
        background: "var(--bg-surface)", boxShadow: "var(--card-shadow)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            Audit Trail Records ({total.toLocaleString()})
          </span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Page {page} of {totalPages}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                <th style={{ padding: "12px 18px" }}>User</th>
                <th style={{ padding: "12px 14px" }}>Status</th>
                <th style={{ padding: "12px 14px" }}>Device &amp; OS</th>
                <th style={{ padding: "12px 14px" }}>Browser</th>
                <th style={{ padding: "12px 14px" }}>IP Address</th>
                <th style={{ padding: "12px 14px" }}>Device ID</th>
                <th style={{ padding: "12px 14px" }}>Timestamp</th>
                <th style={{ padding: "12px 18px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    Loading security audit logs...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    No audit records match the current filter criteria.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isSuccess = item.status === "SUCCESS";
                  const deviceIcon =
                    item.deviceType === "MOBILE" ? "📱" : item.deviceType === "TABLET" ? "📟" : "🖥️";

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: item.isSuspicious ? "rgba(248, 81, 73, 0.05)" : "transparent",
                      }}
                    >
                      {/* User details */}
                      <td style={{ padding: "12px 18px" }}>
                        {item.user ? (
                          <div>
                            <div
                              onClick={() => openUserInspection(item.user!.id)}
                              style={{ fontWeight: 700, color: "#60a5fa", cursor: "pointer", textDecoration: "underline" }}
                            >
                              {item.user.name}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.email}</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 600, color: "#f85149" }}>Unregistered Account</div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.email}</div>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "2px 8px",
                              borderRadius: 99,
                              fontSize: 11,
                              fontWeight: 700,
                              width: "fit-content",
                              background: isSuccess ? "rgba(63, 185, 80, 0.15)" : "rgba(248, 81, 73, 0.15)",
                              color: isSuccess ? "#3fb950" : "#f85149",
                              border: `1px solid ${isSuccess ? "rgba(63, 185, 80, 0.3)" : "rgba(248, 81, 73, 0.3)"}`,
                            }}
                          >
                            {isSuccess ? "✓ SUCCESS" : "✕ FAILED"}
                          </span>
                          {item.failureReason && (
                            <span style={{ fontSize: 11, color: "#f85149" }}>
                              {item.failureReason}
                            </span>
                          )}
                          {item.isSuspicious && (
                            <span style={{ fontSize: 10, color: "#e3b341", fontWeight: 700 }}>
                              ⚠️ High Velocity
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Device & OS */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{deviceIcon}</span>
                          <div>
                            <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.os} {item.osVersion || ""}</div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                              {item.deviceModel || item.deviceType.toLowerCase()}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Browser */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.browser}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          v{item.browserVersion ? item.browserVersion.split(".")[0] : "latest"}
                        </div>
                      </td>

                      {/* IP Address */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <code style={{
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "2px 6px",
                            color: "var(--accent)",
                            fontSize: 12,
                            fontFamily: "monospace",
                          }}>
                            {item.ipAddress}
                          </code>
                          <button
                            onClick={() => copyToClipboard(item.ipAddress, "IP Address")}
                            title="Copy IP"
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-secondary)",
                              cursor: "pointer",
                              padding: 2,
                              fontSize: 12,
                            }}
                          >
                            📋
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {item.city ? `${item.city}, ` : ""}{item.country || "Network"}
                        </div>
                      </td>

                      {/* Device ID */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <code style={{
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "2px 6px",
                            color: "var(--text-primary)",
                            fontSize: 11,
                            fontFamily: "monospace",
                          }}>
                            {item.deviceId ? `${item.deviceId.slice(0, 10)}...` : "None"}
                          </code>
                          {item.deviceId && (
                            <button
                              onClick={() => copyToClipboard(item.deviceId, "Device ID")}
                              title="Copy Full Device ID"
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                padding: 2,
                                fontSize: 12,
                              }}
                            >
                              📋
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}>
                          {new Date(item.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {new Date(item.createdAt).toLocaleTimeString("en-IN", { second: "2-digit" })}
                        </div>
                      </td>

                      {/* Action */}
                      <td style={{ padding: "12px 18px", textAlign: "right" }}>
                        {item.userId ? (
                          <button
                            onClick={() => openUserInspection(item.userId!)}
                            style={{
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border)",
                              color: "#60a5fa",
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Inspect User
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>N/A</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}>
            <span>Showing Page {page} of {totalPages}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => loadData(page - 1)}
                disabled={page <= 1 || loading}
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: page <= 1 ? "var(--text-muted)" : "var(--text-primary)",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  cursor: page <= 1 ? "default" : "pointer",
                }}
              >
                Previous
              </button>
              <button
                onClick={() => loadData(page + 1)}
                disabled={page >= totalPages || loading}
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: page >= totalPages ? "var(--text-muted)" : "var(--text-primary)",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  cursor: page >= totalPages ? "default" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Security Overview Modal */}
      {inspectUserId && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          zIndex: 1000,
        }}>
          <div style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            width: "100%",
            maxWidth: 840,
            maxHeight: "90vh",
            overflowY: "auto",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
          }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>👤</span> User Security &amp; Device Profile
                </h3>
                {userOverview && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                    {userOverview.user.name} ({userOverview.user.email}) · Member since {new Date(userOverview.user.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setInspectUserId(null);
                  setUserOverview(null);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {loadingOverview || !userOverview ? (
              <div style={{ padding: "60px", textAlign: "center", color: "var(--text-secondary)" }}>
                Loading user security telemetry...
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <div style={{ background: "var(--bg-elevated)", padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>TOTAL LOGINS</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>{userOverview.totalLogins}</div>
                  </div>
                  <div style={{ background: "var(--bg-elevated)", padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>FAILED ATTEMPTS</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: userOverview.failedAttempts > 0 ? "#f85149" : "#3fb950", marginTop: 4 }}>
                      {userOverview.failedAttempts}
                    </div>
                  </div>
                  <div style={{ background: "var(--bg-elevated)", padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>KNOWN DEVICES</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#a78bfa", marginTop: 4 }}>{userOverview.devices.length}</div>
                  </div>
                  <div style={{ background: "var(--bg-elevated)", padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>KNOWN NETWORKS (IPs)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#38bdf8", marginTop: 4 }}>{userOverview.ips.length}</div>
                  </div>
                </div>

                {/* Recognized Devices */}
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
                    📱 Hardware &amp; Device Fingerprints ({userOverview.devices.length})
                  </h4>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", textAlign: "left" }}>
                          <th style={{ padding: "8px 12px" }}>Device Type</th>
                          <th style={{ padding: "8px 12px" }}>Browser / OS</th>
                          <th style={{ padding: "8px 12px" }}>Device ID</th>
                          <th style={{ padding: "8px 12px" }}>Times Used</th>
                          <th style={{ padding: "8px 12px" }}>Last Seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userOverview.devices.map((d) => (
                          <tr key={d.deviceId} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 12px", color: "var(--text-primary)", fontWeight: 600 }}>
                              {d.deviceType === "MOBILE" ? "📱 Mobile" : "🖥️ Desktop"}
                            </td>
                            <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>
                              {d.browser} on {d.os}
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <code style={{ color: "#60a5fa" }}>{d.deviceId.slice(0, 16)}...</code>
                            </td>
                            <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{d.loginCount} logins</td>
                            <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>
                              {new Date(d.lastSeen).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Network IP addresses */}
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
                    🌐 IP Addresses Used ({userOverview.ips.length})
                  </h4>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {userOverview.ips.map((ip) => (
                      <div
                        key={ip.ipAddress}
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "8px 12px",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <code style={{ color: "#38bdf8", fontWeight: 700 }}>{ip.ipAddress}</code>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>({ip.count}x)</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{ip.city ? `${ip.city}, ` : ""}{ip.country || "Network"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Close Button */}
                <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                  <button
                    onClick={() => {
                      setInspectUserId(null);
                      setUserOverview(null);
                    }}
                    style={{
                      background: "var(--bg-hover)",
                      border: "none",
                      color: "var(--text-primary)",
                      padding: "8px 18px",
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
