import { useEffect } from "react";

declare global {
  interface Window {
    particlesJS?: (tagId: string, params: unknown) => void;
    pJSDom?: Array<{
      pJS?: {
        canvas?: { el?: HTMLCanvasElement };
        fn?: { vendors?: { destroypJS?: () => void } };
      };
    }>;
  }
}

type DataParticlesBackgroundProps = {
  id?: string;
  variant?: "hero" | "section";
};

export default function DataParticlesBackground({
  id = "landing-particles",
  variant = "hero",
}: DataParticlesBackgroundProps) {
  useEffect(() => {
    const initParticles = () => {
      if (!window.particlesJS) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isSection = variant === "section";

      window.particlesJS(id, {
        particles: {
          number: {
            value: reduceMotion ? (isSection ? 16 : 22) : isSection ? 36 : 54,
            density: { enable: true, value_area: isSection ? 900 : 1050 },
          },
          color: { value: "#d2b46d" },
          shape: {
            type: "polygon",
            polygon: { nb_sides: 6 },
          },
          opacity: {
            value: isSection ? 0.2 : 0.26,
            random: true,
            anim: {
              enable: !reduceMotion,
              speed: 0.18,
              opacity_min: isSection ? 0.08 : 0.1,
              sync: false,
            },
          },
          size: {
            value: isSection ? 3.2 : 3.8,
            random: true,
            anim: {
              enable: !reduceMotion,
              speed: 0.35,
              size_min: 2,
              sync: false,
            },
          },
          line_linked: {
            enable: true,
            distance: isSection ? 105 : 125,
            color: "#8fa4cb",
            opacity: isSection ? 0.2 : 0.28,
            width: isSection ? 0.8 : 1,
          },
          move: {
            enable: !reduceMotion,
            speed: isSection ? 0.18 : 0.26,
            direction: "none",
            random: true,
            straight: false,
            out_mode: "out",
            bounce: false,
          },
        },
        interactivity: {
          detect_on: "canvas",
          events: {
            onhover: { enable: false, mode: "repulse" },
            onclick: { enable: false, mode: "push" },
            resize: true,
          },
        },
        retina_detect: true,
      });
    };

    const existingScript = document.querySelector(
      'script[data-particles-lib="true"]',
    ) as HTMLScriptElement | null;
    if (existingScript && window.particlesJS) {
      initParticles();
    } else {
      const script = existingScript ?? document.createElement("script");
      if (!existingScript) {
        script.src = "/particles.min.js";
        script.async = true;
        script.dataset.particlesLib = "true";
        document.body.appendChild(script);
      }
      script.addEventListener("load", initParticles);
    }

    return () => {
      const script = document.querySelector(
        'script[data-particles-lib="true"]',
      ) as HTMLScriptElement | null;
      script?.removeEventListener("load", initParticles);

      const dom = window.pJSDom;
      if (dom?.length) {
        const instance = dom.find((item) => item.pJS?.canvas?.el?.parentElement?.id === id);
        instance?.pJS?.fn?.vendors?.destroypJS?.();
      }
    };
  }, [id, variant]);

  return (
    <div className={variant === "section" ? "data-particles-layer data-particles-layer--section" : "data-particles-layer"} aria-hidden="true">
      <div className="data-grid-overlay" />
      <div id={id} className="data-particles-canvas" />
      <div className="data-particles-softener" />
    </div>
  );
}
