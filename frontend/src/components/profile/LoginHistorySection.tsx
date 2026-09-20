import { useEffect, useState } from "react";
import { ProfileAPI, UserLoginHistoryItem } from "../../services/profileApi";
import { getOrCreateDeviceId } from "../../utils/device";

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 45) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function LoginHistorySection() {
  const [history, setHistory] = useState<UserLoginHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const currentDeviceId = getOrCreateDeviceId();

  async function load(p = 1) {
    setLoading(true);
    try {
      const res = await ProfileAPI.getLoginHistory(p, 10);
      setHistory(res.data.items || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
      setPage(p);
    } catch (err) {
      console.error("Failed to load login history:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header card with security guidance */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "20px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16,
        boxShadow: "var(--card-shadow)",
      }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🔐</span> Security &amp; Login History
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
            Review all recent logins, recognized devices, and network IP addresses accessing your account.
          </p>
        </div>
        <button
          onClick={() => load(page)}
          disabled={loading}
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.15s",
          }}
        >
          <span>🔄</span> {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Security notice tip */}
      <div style={{
        background: "var(--blue-bg)",
        border: "1px solid var(--blue-border)",
        borderRadius: 12,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>🛡️</span>
        <div style={{ fontSize: 12, color: "var(--accent)", lineHeight: 1.5 }}>
          <strong>Security Protection:</strong> If you notice an unfamiliar IP address or unrecognized device, we recommend changing your password immediately and reporting any suspicious behavior.
        </div>
      </div>

      {/* Login records */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "var(--card-shadow)",
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            Recent Sessions ({total})
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Current Device ID: <code style={{ color: "var(--accent)" }}>{currentDeviceId.slice(0, 8)}...</code>
          </span>
        </div>

        {loading && history.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
            Loading login history...
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
            No recorded login history found yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {history.map((item) => {
              const isThisDevice = item.isCurrentDevice || item.deviceId === currentDeviceId;
              const isSuccess = item.status === "SUCCESS";
              const deviceIcon =
                item.deviceType === "MOBILE" ? "📱" : item.deviceType === "TABLET" ? "📟" : "🖥️";

              return (
                <div
                  key={item.id}
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 14,
                    background: isThisDevice ? "var(--blue-bg)" : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Left: Device & Status */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 260 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        background: isSuccess ? "var(--green-bg)" : "var(--red-bg)",
                        border: `1px solid ${isSuccess ? "var(--green-border)" : "var(--red-border)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      {deviceIcon}
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                          {item.browser} {item.browserVersion ? `(${item.browserVersion.split(".")[0]})` : ""}
                        </span>
                        {isThisDevice && (
                          <span
                            style={{
                              background: "var(--blue-bg)",
                              color: "var(--accent)",
                              border: "1px solid var(--blue-border)",
                              borderRadius: 99,
                              padding: "2px 8px",
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            ● This Device
                          </span>
                        )}
                        <span
                          style={{
                            background: isSuccess ? "var(--green-bg)" : "var(--red-bg)",
                            color: isSuccess ? "var(--green)" : "var(--red)",
                            border: `1px solid ${isSuccess ? "var(--green-border)" : "var(--red-border)"}`,
                            borderRadius: 99,
                            padding: "2px 8px",
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {isSuccess ? "Successful Login" : `Failed: ${item.failureReason || "Denied"}`}
                        </span>
                      </div>

                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                        <span>{item.os}</span>
                        {item.deviceModel && item.deviceModel !== "PC (Windows)" && item.deviceModel !== "Macintosh" && (
                          <span> · {item.deviceModel}</span>
                        )}
                        <span> · {item.deviceType.toLowerCase()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: IP & Location */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 160 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>IP:</span>
                      <code
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          color: "var(--accent)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {item.ipAddress}
                      </code>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {item.city ? `${item.city}, ` : ""}{item.country || "Network session"}
                      {item.timezone ? ` · ${item.timezone.split("/")[1] || item.timezone}` : ""}
                    </div>
                  </div>

                  {/* Right: Timestamp */}
                  <div style={{ textAlign: "right", minWidth: 140 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                      {formatRelativeTime(item.createdAt)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {new Date(item.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            <span>Page {page} of {totalPages}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => load(page - 1)}
                disabled={page <= 1 || loading}
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: page <= 1 ? "var(--text-muted)" : "var(--text-primary)",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: page <= 1 ? "default" : "pointer",
                }}
              >
                Previous
              </button>
              <button
                onClick={() => load(page + 1)}
                disabled={page >= totalPages || loading}
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: page >= totalPages ? "var(--text-muted)" : "var(--text-primary)",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: page >= totalPages ? "default" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
