import { describe, expect, test } from "vitest";

function rootDomainOnly(domain: string): string {
  const d = domain.toLowerCase().replace(/^www\./i, "");
  const labels = d.split(".").filter(Boolean);
  if (labels.length <= 2) return d;
  const publicSuffix3Labels = ["co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "org.au", "net.au", "co.jp"];
  const last3 = labels.slice(-3).join(".");
  if (publicSuffix3Labels.includes(last3)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

function inferPatternFromPublicEmails(emails: string[], domain: string): "first.last" | "flast" | null {
  const root = rootDomainOnly(domain);
  const locals = emails
    .map(e => e.toLowerCase())
    .filter(e => e.endsWith(`@${root}`))
    .map(e => e.split("@")[0] ?? "")
    .filter(Boolean);
  if (locals.length === 0) return null;
  const dotCount = locals.filter(l => l.includes(".")).length;
  if (dotCount / locals.length >= 0.6) return "first.last";
  const shortCount = locals.filter(l => l.length <= 8).length;
  if (shortCount / locals.length >= 0.6) return "flast";
  return null;
}

describe("prospecting v1 pattern inference", () => {
  test("infers first.last when most locals have dot", () => {
    expect(
      inferPatternFromPublicEmails(
        ["alice.smith@acme.com", "bob.jones@acme.com", "carol@acme.com"],
        "acme.com",
      ),
    ).toBe("first.last");
  });

  test("infers flast when locals are short without dots", () => {
    expect(
      inferPatternFromPublicEmails(["asmith@acme.com", "bjones@acme.com", "clee@acme.com"], "acme.com"),
    ).toBe("flast");
  });
});

