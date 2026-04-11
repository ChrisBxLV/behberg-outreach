import { describe, expect, test } from "vitest";
import {
  guessEmailsFromName,
  inferPatternFromPublicEmails,
  matchesSignalNeedles,
  rootDomainOnly,
} from "./services/prospectingV1Utils";

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

describe("prospecting v1 helper hardening", () => {
  test("rootDomainOnly keeps known multi-part public suffixes", () => {
    expect(rootDomainOnly("news.company.co.uk")).toBe("company.co.uk");
  });

  test("guessEmailsFromName skips malformed local parts", () => {
    const guessed = guessEmailsFromName({
      first: "A",
      last: null,
      domain: "example.com",
      patternHint: "first.last",
    });
    expect(guessed.every(g => !g.email.includes(".."))).toBe(true);
    expect(guessed.every(g => !g.email.includes(".@"))).toBe(true);
  });

  test("matchesSignalNeedles enforces both filters when present", () => {
    expect(
      matchesSignalNeedles({
        haystack: "igaming expansion in latvia",
        industryNeedle: "igaming",
        countryNeedle: "latvia",
      }),
    ).toBe(true);
    expect(
      matchesSignalNeedles({
        haystack: "igaming expansion in sweden",
        industryNeedle: "igaming",
        countryNeedle: "latvia",
      }),
    ).toBe(false);
  });
});

