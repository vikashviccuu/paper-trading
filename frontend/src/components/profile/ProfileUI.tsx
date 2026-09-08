import { FormEvent, ReactNode } from "react";

// ── Shared styles injected once ──────────────────────────────
const STYLE = `
.p-card { background: #0d1117; border: 1px solid #1e2d3d; border-radius: 14px; padding: 24px; margin-bottom: 16px; }
.p-card-hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #1e2d3d; }
.p-card-icon { width: 36px; height: 36px; border-radius: 9px; background: #1e2d42; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; }
.p-card-title { font-size: 15px; font-weight: 700; color: #e6edf3; }
.p-card-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
.p-form { display: flex; flex-direction: column; gap: 14px; }
.p-field { display: flex; flex-direction: column; gap: 5px; }
.p-label { font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.07em; display: flex; align-items: center; gap: 5px; }
.p-label .req { color: #f85149; }
.p-input, .p-select, .p-textarea {
  padding: 9px 12px; background: #131920; border: 1px solid #1e2d3d;
  border-radius: 8px; color: #e6edf3; font-size: 13px;
  font-family: inherit; outline: none; transition: border-color 0.15s, box-shadow 0.15s; width: 100%;
}
.p-input:focus, .p-select:focus, .p-textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 3px #2563eb22; }
.p-input::placeholder { color: #484f58; }
.p-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px; }
.p-textarea { resize: vertical; min-height: 80px; }
.p-btn { padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.15s; align-self: flex-start; }
.p-btn:hover:not(:disabled) { background: #1d4ed8; box-shadow: 0 4px 14px #2563eb44; }
.p-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.p-btn-sec { padding: 7px 14px; background: transparent; color: #8b949e; border: 1px solid #1e2d3d; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.15s; }
.p-btn-sec:hover:not(:disabled) { background: #131920; color: #e6edf3; border-color: #2d3f55; }
.p-btn-sec:disabled { opacity: 0.4; cursor: not-allowed; }
.p-btn-danger { padding: 7px 14px; background: #2d0f0e; color: #f85149; border: 1px solid #5c1f1d; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.15s; }
.p-btn-danger:hover:not(:disabled) { background: #3d1514; }
.p-msg-ok  { padding: 9px 12px; background: #0d2818; border: 1px solid #1a4731; border-radius: 8px; color: #3fb950; font-size: 12px; font-weight: 600; }
.p-msg-err { padding: 9px 12px; background: #2d0f0e; border: 1px solid #5c1f1d; border-radius: 8px; color: #f85149; font-size: 12px; font-weight: 600; }
.p-divider { border: none; border-top: 1px solid #1e2d3d; margin: 4px 0; }
.p-hint { font-size: 12px; color: #64748b; line-height: 1.5; }
.p-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; }
.p-badge-green  { background: #0d2818; color: #3fb950; border: 1px solid #1a4731; }
.p-badge-blue   { background: #1e3a5f; color: #60a5fa; border: 1px solid #2563eb; }
.p-badge-yellow { background: #2d2000; color: #d29922; border: 1px solid #5c4000; }
.p-badge-red    { background: #2d0f0e; color: #f85149; border: 1px solid #5c1f1d; }
.p-badge-gray   { background: #131920; color: #64748b; border: 1px solid #1e2d3d; }
.p-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.p-step { display: flex; align-items: flex-start; gap: 12px; padding: 14px; background: #131920; border: 1px solid #1e2d3d; border-radius: 10px; }
.p-step-num { width: 26px; height: 26px; border-radius: 50%; background: #1e2d42; color: #60a5fa; font-weight: 800; font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
.p-step-title { font-weight: 700; font-size: 13px; color: #e6edf3; margin-bottom: 4px; }
.p-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.p-table th { padding: 8px 12px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.07em; border-bottom: 1px solid #1e2d3d; }
.p-table td { padding: 10px 12px; border-bottom: 1px solid #131920; color: #e6edf3; }
.p-table tr:hover td { background: #131920; }
`;

let injected = false;
function injectStyles() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const el = document.createElement("style");
  el.textContent = STYLE;
  document.head.appendChild(el);
}

// ── Components ───────────────────────────────────────────────
export function PCard({ title, icon, subtitle, children }: { title: string; icon?: string; subtitle?: string; children: ReactNode }) {
  injectStyles();
  return (
    <div className="p-card">
      <div className="p-card-hdr">
        {icon && <div className="p-card-icon">{icon}</div>}
        <div>
          <div className="p-card-title">{title}</div>
          {subtitle && <div className="p-card-sub">{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function PForm({ onSubmit, children }: { onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return <form className="p-form" onSubmit={onSubmit}>{children}</form>;
}

export function PField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="p-field">
      <label className="p-label">{label}{required && <span className="req">*</span>}</label>
      {children}
    </div>
  );
}

export function PBtn({ loading, children, onClick, type = "submit", variant = "primary" }: { loading?: boolean; children: ReactNode; onClick?: () => void; type?: "submit"|"button"; variant?: "primary"|"secondary"|"danger" }) {
  const cls = variant === "secondary" ? "p-btn-sec" : variant === "danger" ? "p-btn-danger" : "p-btn";
  return <button type={type} className={cls} disabled={loading} onClick={onClick}>{loading ? "Saving..." : children}</button>;
}

export function PMsg({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <div className={ok ? "p-msg-ok" : "p-msg-err"}>{ok ? "✓ " : "✗ "}{children}</div>;
}
