import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  WORKER_HEARTBEAT_MAX_AGE_SEC,
  _setWorkerHeartbeatPathForTests,
  evaluateWorkerHeartbeat,
} from "./runtimeHealth";

describe("evaluateWorkerHeartbeat", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rt-hb-"));
    mkdirSync(join(dir, "data", "runtime"), { recursive: true });
    file = join(dir, "data", "runtime", "worker-heartbeat.json");
    _setWorkerHeartbeatPathForTests(file);
  });

  afterEach(() => {
    _setWorkerHeartbeatPathForTests(null);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns not ok when file is missing", () => {
    expect(evaluateWorkerHeartbeat(Date.now())).toEqual({
      ok: false,
      lastSeenAt: null,
      ageSeconds: null,
    });
  });

  it("returns ok when heartbeat is fresh", () => {
    const iso = new Date(Date.now() - 10_000).toISOString();
    writeFileSync(file, JSON.stringify({ lastSeenAt: iso }));
    const w = evaluateWorkerHeartbeat(Date.now());
    expect(w.ok).toBe(true);
    expect(w.lastSeenAt).toBe(iso);
    expect(w.ageSeconds).toBeGreaterThanOrEqual(9);
    expect(w.ageSeconds).toBeLessThanOrEqual(12);
  });

  it("returns not ok when heartbeat is stale (>= 90s)", () => {
    const iso = new Date(Date.now() - (WORKER_HEARTBEAT_MAX_AGE_SEC + 30) * 1000).toISOString();
    writeFileSync(file, JSON.stringify({ lastSeenAt: iso }));
    const w = evaluateWorkerHeartbeat(Date.now());
    expect(w.ok).toBe(false);
    expect(w.ageSeconds).not.toBeNull();
    expect(w.ageSeconds!).toBeGreaterThanOrEqual(WORKER_HEARTBEAT_MAX_AGE_SEC);
  });
});
