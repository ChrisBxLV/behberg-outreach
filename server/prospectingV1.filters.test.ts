import { describe, expect, test } from "vitest";
import { matchesSignalNeedles } from "./services/prospectingV1Utils";

describe("prospecting v1 signal filtering", () => {
  test("requires industry keyword match when provided", () => {
    expect(
      matchesSignalNeedles({
        haystack: "funding round in fintech and payments",
        industryNeedle: "igaming",
        countryNeedle: "",
      }),
    ).toBe(false);
    expect(
      matchesSignalNeedles({
        haystack: "igaming platform launches in latam",
        industryNeedle: "igaming",
        countryNeedle: "",
      }),
    ).toBe(true);
  });

  test("requires both industry and country when both are provided", () => {
    expect(
      matchesSignalNeedles({
        haystack: "igaming hiring expansion in malta",
        industryNeedle: "igaming",
        countryNeedle: "malta",
      }),
    ).toBe(true);
    expect(
      matchesSignalNeedles({
        haystack: "igaming hiring expansion in cyprus",
        industryNeedle: "igaming",
        countryNeedle: "malta",
      }),
    ).toBe(false);
  });
});
