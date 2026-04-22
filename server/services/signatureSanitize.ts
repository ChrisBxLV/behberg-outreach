import sanitizeHtml from "sanitize-html";

const SIGNATURE_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "a", "b", "br", "div", "em", "h1", "h2", "h3", "h4", "i", "img", "li", "ol", "p", "span", "strong", "u", "ul",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "title"],
    img: ["alt", "src", "height", "width", "style"],
    "*": ["class", "style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: "noopener noreferrer" },
    }),
  },
};

export function sanitizeSignatureHtml(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  return sanitizeHtml(raw, SIGNATURE_SANITIZE);
}
