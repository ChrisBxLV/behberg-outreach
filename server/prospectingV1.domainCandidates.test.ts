import { describe, expect, test } from "vitest";
import { generateDomainCandidates } from "./services/prospectingV1Utils";

describe("prospecting v1 domain candidate generation", () => {
  test("generates common free-fallback candidates", () => {
    const candidates = generateDomainCandidates("Acme Inc");
    expect(candidates).toContain("acme.com");
    expect(candidates).toContain("acme.io");
    expect(candidates).toContain("acme.co");
  });

  test("filters obvious suffix-only fragments", () => {
    const candidates = generateDomainCandidates("The Group Ltd");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some(c => c.startsWith("group."))).toBe(false);
  });
});
