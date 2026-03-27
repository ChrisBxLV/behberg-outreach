export function loadAnalytics() {
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;

  if (!endpoint || !websiteId) {
    return;
  }

  const existing = document.querySelector('script[data-website-id]');
  if (existing) {
    return;
  }

  const script = document.createElement("script");
  script.defer = true;
  script.src = `${endpoint}/umami`;
  script.setAttribute("data-website-id", websiteId);
  document.body.appendChild(script);
}
