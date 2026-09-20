import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "../store/ThemeContext";

export const ThemeSelector: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { theme, setTheme, themes, currentTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="theme-selector-wrap" ref={ref}>
      <button
        type="button"
        className="theme-switch-btn"
        onClick={() => setOpen((prev) => !prev)}
        title="Switch color theme"
      >
        <span className="theme-switch-dot" style={{ backgroundColor: currentTheme.dot }} />
        <span>🎨</span>
        {!compact && <span>{currentTheme.name}</span>}
        <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div className="theme-dropdown">
          <div className="theme-dropdown-header">Color Themes</div>
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-opt-item ${theme === t.id ? "active" : ""}`}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
            >
              <div
                className="theme-opt-swatch"
                style={{ background: t.surface, borderColor: t.dot }}
              >
                <div className="theme-opt-dot" style={{ backgroundColor: t.dot }} />
              </div>
              <div className="theme-opt-text">
                <div className="theme-opt-name">
                  <span>{t.name}</span>
                  {theme === t.id && (
                    <span style={{ color: "var(--accent)", fontSize: 11 }}>✓</span>
                  )}
                </div>
                <div className="theme-opt-desc">{t.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ThemeSelector;
