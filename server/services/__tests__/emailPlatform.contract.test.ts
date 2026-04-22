import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../providers", () => ({
  getMicrosoftGraphAccessTokenForMailbox: vi.fn().mockResolvedValue("test-access-token"),
}));

describe("Microsoft Graph inbound message fetch (mocked HTTP)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg-in-1",
        conversationId: "conv-aa",
        from: { emailAddress: { address: "lead@example.com" } },
        uniqueBody: { contentType: "text", content: "Thanks — interested." },
      }),
    }) as any;
  });

  it("fetchMicrosoftGraphMessage returns conversation and extractPlainText reads uniqueBody", async () => {
    const { fetchMicrosoftGraphMessage, extractPlainTextFromGraphMessage } = await import("../inboundMessageFetch");
    const m = await fetchMicrosoftGraphMessage(1, "msg-in-1");
    expect(m?.conversationId).toBe("conv-aa");
    expect(extractPlainTextFromGraphMessage(m!)).toContain("interested");
  });
});
