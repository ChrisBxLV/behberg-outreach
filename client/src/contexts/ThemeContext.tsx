import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

type ThemeTransition = {
  id: number;
  from: Theme;
  to: Theme;
  fromBackground: string;
  toBackground: string;
  originX: number;
  originY: number;
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: (e?: { clientX: number; clientY: number } | undefined) => void;
  switchable: boolean;
  transition?: ThemeTransition;
  clearTransition: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
  forceDefaultTheme?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
  forceDefaultTheme = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable && !forceDefaultTheme) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });
  const [transition, setTransition] = useState<ThemeTransition | undefined>(undefined);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  useEffect(() => {
    if (!forceDefaultTheme) return;
    setTheme(defaultTheme);
    // Persisting is helpful even when not currently switchable, since
    // other parts of the app (or future config) may read it.
    try {
      localStorage.setItem("theme", defaultTheme);
    } catch {
      // ignore
    }
  }, [defaultTheme, forceDefaultTheme, switchable]);

  const readThemeBackground = (t: Theme) => {
    // Read CSS variables for the given theme without changing the app theme.
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.left = "-9999px";
    probe.style.top = "0";
    probe.style.width = "1px";
    probe.style.height = "1px";
    if (t === "dark") probe.classList.add("dark");
    document.body.appendChild(probe);
    const raw = getComputedStyle(probe).getPropertyValue("--background").trim();
    probe.remove();
    // Convert OKLCH (etc) to rgb() so we can use it in canvas/CSS everywhere.
    const span = document.createElement("span");
    span.style.color = raw;
    span.style.position = "fixed";
    span.style.left = "-9999px";
    document.body.appendChild(span);
    const rgb = getComputedStyle(span).color;
    span.remove();
    return rgb || raw || (t === "dark" ? "rgb(0,0,0)" : "rgb(255,255,255)");
  };

  const toggleTheme = switchable
    ? (e?: { clientX: number; clientY: number }) => {
        const from = theme;
        const to: Theme = theme === "light" ? "dark" : "light";
        const fromBackground = readThemeBackground(from);
        const toBackground = readThemeBackground(to);
        const originX = Math.round(e?.clientX ?? window.innerWidth * 0.72);
        const originY = Math.round(e?.clientY ?? window.innerHeight * 0.28);
        setTransition({
          id: Date.now(),
          from,
          to,
          fromBackground,
          toBackground,
          originX,
          originY,
        });
        setTheme(to);
      }
    : undefined;

  const clearTransition = useMemo(() => () => setTransition(undefined), []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable, transition, clearTransition }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
