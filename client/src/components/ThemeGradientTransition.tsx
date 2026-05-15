import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function ThemeGradientTransition() {
  const { transition } = useTheme();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);

  const key = transition?.id ?? 0;

  const config = useMemo(() => {
    if (!transition) return null;
    return {
      fromBg: transition.fromBackground,
      toBg: transition.toBackground,
      durationMs: 1000,
      featherPx: 140,
      originX: transition.originX,
      originY: transition.originY,
    };
  }, [key]);

  useEffect(() => {
    // "Torch" reveal should only run when entering dark mode.
    if (!transition || !config || transition.to === "light") return;
    const el = layerRef.current;
    if (!el) return;

    setVisible(true);

    const start = performance.now();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const maxR = Math.hypot(w, h);
    const cx = config.originX;
    const cy = config.originY;

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / config.durationMs);
      const eased = easeInOutCubic(p);
      const r = eased * maxR;
      const inner = Math.max(0, r - config.featherPx);
      const outer = r;

      // Overlay represents the *previous* theme and dissolves away (radial feather)
      // to reveal the already-applied new theme underneath.
      // IMPORTANT: don't set backgroundColor to fromBg, otherwise the transparent center
      // will still show fromBg (no "reveal"). Keep backgroundColor transparent and use
      // the gradient to paint only the "still-covered" area.
      el.style.backgroundColor = "transparent";
      el.style.backgroundImage =
        `radial-gradient(circle at ${cx}px ${cy}px, ` +
        `rgba(0,0,0,0) 0px ${inner}px, ` +
        `${config.fromBg} ${outer}px 100%)`;
      el.style.opacity = String(1 - eased * 0.98);

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setVisible(false);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setVisible(false);
    };
  }, [key, config, transition]);

  // Render whenever a transition exists so the ref is available for the first rAF tick.
  if (!transition || !config || transition.to === "light") return null;

  return (
    <div
      ref={layerRef}
      className="fixed inset-0 z-[99] pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        willChange: "opacity, background-image",
      }}
    />
  );
}

