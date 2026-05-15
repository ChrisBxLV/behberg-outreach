import { useEffect } from "react";

declare global {
  interface Window {
    particlesJS?: (tagId: string, params: unknown) => void;
    pJSDom?: Array<{ pJS?: { fn?: { vendors?: { destroypJS?: () => void } } } }>;
  }
}

export default function DataParticlesBackground() {
  useEffect(() => {
    const initParticles = () => {
      if (!window.particlesJS) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      window.particlesJS("landing-particles", {
        particles: {
          number: { value: reduceMotion ? 22 : 54, density: { enable: true, value_area: 1050 } },
          color: { value: "#d2b46d" },
          shape: {
            type: "polygon",
            polygon: { nb_sides: 6 },
          },
          opacity: {
            value: 0.26,
            random: true,
            anim: {
              enable: !reduceMotion,
              speed: 0.18,
              opacity_min: 0.1,
              sync: false,
            },
          },
          size: {
            value: 3.8,
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
            distance: 125,
            color: "#8fa4cb",
            opacity: 0.28,
            width: 1,
          },
          move: {
            enable: !reduceMotion,
            speed: 0.26,
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
      return;
    }

    const script = existingScript ?? document.createElement("script");
    if (!existingScript) {
      script.src = "/particles.min.js";
      script.async = true;
      script.dataset.particlesLib = "true";
      document.body.appendChild(script);
    }
    script.onload = () => initParticles();

    return () => {
      const dom = window.pJSDom;
      if (dom?.length) {
        const last = dom[dom.length - 1];
        last?.pJS?.fn?.vendors?.destroypJS?.();
      }
    };
  }, []);

  return (
    <div className="data-particles-layer" aria-hidden="true">
      <div className="data-grid-overlay" />
      <div id="landing-particles" className="data-particles-canvas" />
      <div className="data-particles-softener" />
    </div>
  );
}
