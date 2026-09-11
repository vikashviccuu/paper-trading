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
        background: "rgba(13, 17, 28, 0.95)",
        border: "1px solid #1e2d3d",
        borderRadius: 14,
        padding: "20px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16
      }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e6edf3", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🔐</span> Security &amp; Login History
          </h3>
          <p style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>
            Review all recent logins, recognized devices, and network IP addresses accessing your account.
          </p>
        </div>
        <button
          onClick={() => load(page)}
          disabled={loading}
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            color: "#e6edf3",
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
          <span>🔄</span> {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Security notice tip */}
      <div style={{
        background: "rgba(37, 99, 235, 0.08)",
        border: "1px solid rgba(37, 99, 235, 0.25)",
        borderRadius: 12,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>🛡️</span>
        <div style={{ fontSize: 12, color: "#93c5fd", lineHeight: 1.5 }}>
          <strong>Security Protection:</strong> If you notice an unfamiliar IP address or unrecognized device, we recommend changing your password immediately and reporting any suspicious behavior.
        </div>
      </div>

      {/* Login records */}
      <div style={{
        background: "rgba(13, 17, 28, 0.95)",
        border: "1px solid #1e2d3d",
        borderRadius: 14,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #1e2d3d",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
            Recent Sessions ({total})
          </span>
          <span style={{ fontSize: 11, color: "#8b949e" }}>
            Current Device ID: <code style={{ color: "#60a5fa" }}>{currentDeviceId.slice(0, 8)}...</code>
          </span>
        </div>

        {loading && history.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
            Loading login history...
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
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
                    borderBottom: "1px solid #161b22",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 14,
                    background: isThisDevice ? "rgba(37, 99, 235, 0.03)" : "transparent",
                  }}
                >
                  {/* Left: Device & Status */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 260 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        background: isSuccess ? "rgba(63, 185, 80, 0.12)" : "rgba(248, 81, 73, 0.12)",
                        border: `1px solid ${isSuccess ? "rgba(63, 185, 80, 0.3)" : "rgba(248, 81, 73, 0.3)"}`,
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
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>
                          {item.browser} {item.browserVersion ? `(${item.browserVersion.split(".")[0]})` : ""}
                        </span>
                        {isThisDevice && (
                          <span
                            style={{
                              background: "rgba(37, 99, 235, 0.2)",
                              color: "#60a5fa",
                              border: "1px solid rgba(37, 99, 235, 0.4)",
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
                            background: isSuccess ? "rgba(63, 185, 80, 0.15)" : "rgba(248, 81, 73, 0.15)",
                            color: isSuccess ? "#3fb950" : "#f85149",
                            border: `1px solid ${isSuccess ? "rgba(63, 185, 80, 0.3)" : "rgba(248, 81, 73, 0.3)"}`,
                            borderRadius: 99,
                            padding: "2px 8px",
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {isSuccess ? "Successful Login" : `Failed: ${item.failureReason || "Denied"}`}
                        </span>
                      </div>

                      <div style={{ fontSize: 12, color: "#8b949e", marginTop: 3 }}>
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
                      <span style={{ fontSize: 12, color: "#8b949e" }}>IP:</span>
                      <code
                        style={{
                          background: "#161b22",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 12,
                          color: "#c9d1d9",
                          fontFamily: "monospace",
                        }}
                      >
                        {item.ipAddress}
                      </code>
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {item.city ? `${item.city}, ` : ""}{item.country || "Network session"}
                      {item.timezone ? ` · ${item.timezone.split("/")[1] || item.timezone}` : ""}
                    </div>
                  </div>

                  {/* Right: Timestamp */}
                  <div style={{ textAlign: "right", minWidth: 140 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3" }}>
                      {formatRelativeTime(item.createdAt)}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
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
              padding: "12px 20px",
              borderTop: "1px solid #1e2d3d",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12,
              color: "#8b949e",
            }}
          >
            <span>Page {page} of {totalPages}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => load(page - 1)}
                disabled={page <= 1 || loading}
                style={{
                  background: "#161b22",
                  border: "1px solid #30363d",
                  color: page <= 1 ? "#484f58" : "#e6edf3",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: page <= 1 ? "default" : "pointer",
                }}
              >
                Previous
              </button>
              <button
                onClick={() => load(page + 1)}
                disabled={page >= totalPages || loading}
                style={{
                  background: "#161b22",
                  border: "1px solid #30363d",
                  color: page >= totalPages ? "#484f58" : "#e6edf3",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
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
