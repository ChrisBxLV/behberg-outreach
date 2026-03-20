import { describe, it, expect, vi, beforeEach } from "vitest";

const appendFileSyncMock = vi.fn();
vi.mock("node:fs", () => ({
  appendFileSync: appendFileSyncMock,
}));

describe("agentDebugLog production gating", () => {
  beforeEach(() => {
    appendFileSyncMock.mockClear();
  });

  it("no-ops when NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    process.env.AGENT_DEBUG_INGEST_URL = "http://127.0.0.1/ingest/test";
    process.env.AGENT_DEBUG_SESSION_ID = "test-session";
    process.env.AGENT_DEBUG_LOG_FILENAME = "agent-debug.log";
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const mod = await import("./_core/agentDebugLog");
    mod.agentDebugLog({
      location: "test",
      message: "hello",
      hypothesisId: "H_TEST",
      runId: "run1",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(appendFileSyncMock).not.toHaveBeenCalled();
  });

  it("logs when not in production", async () => {
    process.env.NODE_ENV = "development";
    process.env.AGENT_DEBUG_INGEST_URL = "http://127.0.0.1/ingest/test";
    process.env.AGENT_DEBUG_SESSION_ID = "test-session";
    process.env.AGENT_DEBUG_LOG_FILENAME = "agent-debug.log";
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const mod = await import("./_core/agentDebugLog");
    mod.agentDebugLog({
      location: "test",
      message: "hello",
      hypothesisId: "H_TEST",
      runId: "run1",
    });

    expect(fetchMock).toHaveBeenCalled();
    // agentDebugLog appends twice: once to repo-root file and once to cwd file.
    expect(appendFileSyncMock.mock.calls.length).toBeGreaterThan(0);
  });
});

