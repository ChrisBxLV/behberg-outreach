import { useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Adds a short-lived attribute to the <html> element so CSS can
 * animate key UI surfaces ("boxes") into place during theme toggle.
 */
export function ThemeDropMotion() {
  const { transition } = useTheme();

  useEffect(() => {
    if (!transition) return;
    const root = document.documentElement;
    root.setAttribute("data-theme-drop", "1");
    root.setAttribute("data-theme-transition", "1");

    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('[data-slot="card"]')
    );
    let maxDelayMs = 0;
    for (let i = 0; i < cards.length; i++) {
      const delayMs = Math.min(i * 55, 520);
      maxDelayMs = Math.max(maxDelayMs, delayMs);
      cards[i].style.setProperty("--theme-drop-delay", `${delayMs}ms`);
    }

    // Keep the attribute long enough so staggered animations aren't cancelled.
    // (drop 640ms) + (text 520ms, starts at delay+140ms) + buffer
    const holdMs = maxDelayMs + 640 + 140 + 520 + 120;

    const t = window.setTimeout(() => {
      root.removeAttribute("data-theme-drop");
      root.removeAttribute("data-theme-transition");
      for (const el of cards) el.style.removeProperty("--theme-drop-delay");
    }, holdMs);

    return () => {
      window.clearTimeout(t);
      root.removeAttribute("data-theme-drop");
      root.removeAttribute("data-theme-transition");
      for (const el of cards) el.style.removeProperty("--theme-drop-delay");
    };
  }, [transition?.id]);

  return null;
}

