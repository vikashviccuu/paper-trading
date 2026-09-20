import React, { createContext, useContext, useState, useEffect } from "react";

export interface ThemeOption {
  id: string;
  name: string;
  desc: string;
  dot: string;
  bg: string;
  surface: string;
  accent: string;
  isLight?: boolean;
}

export const THEMES: ThemeOption[] = [
  {
    id: "modern-white",
    name: "Modern White",
    desc: "Clean Pure White & Precision Blue",
    dot: "#2563eb",
    bg: "#f8fafc",
    surface: "#ffffff",
    accent: "#2563eb",
    isLight: true,
  },
  {
    id: "nordic-snow",
    name: "Nordic Snow",
    desc: "Minimalist Studio White & Sky Cyan",
    dot: "#0284c7",
    bg: "#ffffff",
    surface: "#ffffff",
    accent: "#0284c7",
    isLight: true,
  },
  {
    id: "cyber-midnight",
    name: "Cyber Midnight",
    desc: "Indigo & Deep Space Blue",
    dot: "#6366f1",
    bg: "#090d16",
    surface: "#0e1320",
    accent: "#6366f1",
  },
  {
    id: "pure-obsidian",
    name: "Pure Obsidian",
    desc: "AMOLED Pitch Black & Ice Cyan",
    dot: "#0ea5e9",
    bg: "#020408",
    surface: "#06090e",
    accent: "#0ea5e9",
  },
  {
    id: "bloomberg-slate",
    name: "Bloomberg Slate",
    desc: "Wall St Navy & Warm Amber",
    dot: "#f59e0b",
    bg: "#080f1e",
    surface: "#0d172e",
    accent: "#f59e0b",
  },
  {
    id: "emerald-quant",
    name: "Emerald Quant",
    desc: "Matrix Pine & Mint Green",
    dot: "#10b981",
    bg: "#030f08",
    surface: "#07170e",
    accent: "#10b981",
  },
  {
    id: "neon-nebula",
    name: "Neon Nebula",
    desc: "Velvet Purple & Violet Glow",
    dot: "#a855f7",
    bg: "#0c0817",
    surface: "#120d24",
    accent: "#a855f7",
  },
  {
    id: "titanium-charcoal",
    name: "Titanium Charcoal",
    desc: "Minimal Carbon & Sky Blue",
    dot: "#38bdf8",
    bg: "#111215",
    surface: "#17181c",
    accent: "#38bdf8",
  },
];

interface ThemeContextType {
  theme: string;
  setTheme: (themeId: string) => void;
  isLight: boolean;
  themes: ThemeOption[];
  currentTheme: ThemeOption;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<string>(() => {
    try {
      return localStorage.getItem("terminal_theme") || "modern-white";
    } catch {
      return "modern-white";
    }
  });

  const setTheme = (themeId: string) => {
    setThemeState(themeId);
    try {
      localStorage.setItem("terminal_theme", themeId);
    } catch { }
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const currentTheme = THEMES.find((t) => t.id === theme) || THEMES[0];
  const isLight = theme === "modern-white" || theme === "nordic-snow";

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isLight, themes: THEMES, currentTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
};
