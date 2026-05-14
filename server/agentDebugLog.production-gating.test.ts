import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const appendFileSyncMock = vi.fn();
vi.mock("node:fs", () => ({
  appendFileSync: appendFileSyncMock,
}));

describe("agentDebugLog gating (AGENT_DEBUG_LOGS)", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevFlag = process.env.AGENT_DEBUG_LOGS;
  const prevIngest = process.env.AGENT_DEBUG_INGEST_URL;
  const prevSession = process.env.AGENT_DEBUG_SESSION_ID;
  const prevLogName = process.env.AGENT_DEBUG_LOG_FILENAME;

  beforeEach(() => {
    appendFileSyncMock.mockClear();
  });

  afterEach(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevFlag === undefined) delete process.env.AGENT_DEBUG_LOGS;
    else process.env.AGENT_DEBUG_LOGS = prevFlag;
    if (prevIngest === undefined) delete process.env.AGENT_DEBUG_INGEST_URL;
    else process.env.AGENT_DEBUG_INGEST_URL = prevIngest;
    if (prevSession === undefined) delete process.env.AGENT_DEBUG_SESSION_ID;
    else process.env.AGENT_DEBUG_SESSION_ID = prevSession;
    if (prevLogName === undefined) delete process.env.AGENT_DEBUG_LOG_FILENAME;
    else process.env.AGENT_DEBUG_LOG_FILENAME = prevLogName;
  });

  it("no-ops when AGENT_DEBUG_LOGS is unset (development)", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.AGENT_DEBUG_LOGS;
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

  it("no-ops when AGENT_DEBUG_LOGS is unset (production)", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.AGENT_DEBUG_LOGS;
    process.env.AGENT_DEBUG_INGEST_URL = "http://127.0.0.1/ingest/test";
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

  it("logs when AGENT_DEBUG_LOGS=true (development)", async () => {
    process.env.NODE_ENV = "development";
    process.env.AGENT_DEBUG_LOGS = "true";
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
    expect(appendFileSyncMock.mock.calls.length).toBeGreaterThan(0);
  });
});
