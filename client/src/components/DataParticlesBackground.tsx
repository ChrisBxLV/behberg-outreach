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
      window.particlesJS("landing-particles", {
        particles: {
          number: { value: 70, density: { enable: true, value_area: 850 } },
          color: { value: "#d2b46d" },
          shape: {
            type: "polygon",
            polygon: { nb_sides: 6 },
          },
          opacity: {
            value: 0.34,
            random: true,
            anim: { enable: true, speed: 0.35, opacity_min: 0.14, sync: false },
          },
          size: {
            value: 5,
            random: true,
            anim: { enable: true, speed: 1.2, size_min: 2.2, sync: false },
          },
          line_linked: {
            enable: true,
            distance: 130,
            color: "#8fa4cb",
            opacity: 0.62,
            width: 1.5,
          },
          move: {
            enable: true,
            speed: 0.9,
            direction: "none",
            random: false,
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
    </div>
  );
}
