import { FormEvent, ReactNode } from "react";

// ── Shared styles injected once ──────────────────────────────
const STYLE = `
.p-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 14px; padding: 24px; margin-bottom: 16px; box-shadow: var(--card-shadow); transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.p-card:hover { border-color: var(--border-light); }
.p-card-hdr { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.p-card-icon { width: 38px; height: 38px; border-radius: 10px; background: var(--blue-bg); border: 1px solid var(--blue-border); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.p-card-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.p-card-sub { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.p-form { display: flex; flex-direction: column; gap: 16px; }
.p-field { display: flex; flex-direction: column; gap: 6px; }
.p-label { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.07em; display: flex; align-items: center; gap: 5px; }
.p-label .req { color: var(--red); }
.p-input, .p-select, .p-textarea {
  padding: 10px 14px; background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text-primary); font-size: 13px;
  font-family: inherit; outline: none; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); width: 100%;
}
.p-input:focus, .p-select:focus, .p-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); background: var(--bg-surface); }
.p-input::placeholder { color: var(--text-muted); }
.p-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; cursor: pointer; }
.p-textarea { resize: vertical; min-height: 84px; }
.p-btn { padding: 10px 22px; background: linear-gradient(135deg, var(--accent), #1d4ed8); color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); align-self: flex-start; box-shadow: 0 2px 8px var(--accent-glow); display: inline-flex; align-items: center; justify-content: center; }
.p-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 14px var(--accent-glow); filter: brightness(1.08); }
.p-btn:active:not(:disabled) { transform: translateY(0); }
.p-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.p-btn-sec { padding: 8px 16px; background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; justify-content: center; }
.p-btn-sec:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-light); transform: translateY(-1px); }
.p-btn-sec:disabled { opacity: 0.4; cursor: not-allowed; }
.p-btn-danger { padding: 8px 16px; background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; justify-content: center; }
.p-btn-danger:hover:not(:disabled) { background: rgba(220, 38, 38, 0.16); transform: translateY(-1px); }
.p-msg-ok  { padding: 10px 14px; background: var(--green-bg); border: 1px solid var(--green-border); border-radius: 8px; color: var(--green); font-size: 12px; font-weight: 600; }
.p-msg-err { padding: 10px 14px; background: var(--red-bg); border: 1px solid var(--red-border); border-radius: 8px; color: var(--red); font-size: 12px; font-weight: 600; }
.p-divider { border: none; border-top: 1px solid var(--border); margin: 6px 0; }
.p-hint { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
.p-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }
.p-badge-green  { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
.p-badge-blue   { background: var(--blue-bg); color: var(--accent); border: 1px solid var(--blue-border); }
.p-badge-yellow { background: var(--yellow-bg); color: var(--yellow); border: 1px solid var(--yellow-border); }
.p-badge-red    { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); }
.p-badge-gray   { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border); }
.p-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.p-step { display: flex; align-items: flex-start; gap: 14px; padding: 16px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.p-step:hover { border-color: var(--border-light); }
.p-step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--blue-bg); border: 1px solid var(--blue-border); color: var(--accent); font-weight: 800; font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
.p-step-title { font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 4px; }
.p-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.p-table th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.07em; border-bottom: 1px solid var(--border); background: var(--bg-elevated); }
.p-table td { padding: 12px 14px; border-bottom: 1px solid var(--border); color: var(--text-primary); }
.p-table tr:hover td { background: var(--bg-hover); }
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
