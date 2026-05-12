/**
 * In-process Prospect DB crawler scheduler: polls DB settings every 30s and runs
 * at most one bounded tick per lane when due. Does not replace external cron if
 * you still use it; multiple pollers duplicate work across processes unless only
 * one app instance runs this module.
 */

import { isProspectCrawlerDisabled, tickQueueCompany, tickQueueEmployee, tickSeeds } from "./crawler";
import { advanceProspectSchedulerAfterTick } from "./crawlerControl";
import { getProspectCrawlerRuntimeSettings, invalidateProspectCrawlerSettingsCache } from "./crawlerSettings";

const POLL_MS = 30_000;

const mem = { seed: false, company: false, employee: false };

type ProspectSchedulerStage = "seed" | "company" | "employee";

// Per-lane activity slots. Each lane writes ONLY its own slot. `mem` is set
// synchronously before any await so overlapping polls cannot enter the same lane.
const active: Record<ProspectSchedulerStage, number | null> = {
  seed: null,
  company: null,
  employee: null,
};

export function getProspectSchedulerActivity(): { stage: ProspectSchedulerStage | null } {
  const running: Array<[ProspectSchedulerStage, number]> = [];
  if (active.seed != null) running.push(["seed", active.seed]);
  if (active.company != null) running.push(["company", active.company]);
  if (active.employee != null) running.push(["employee", active.employee]);
  if (running.length === 0) return { stage: null };
  // Report the oldest still-running stage; it best reflects ongoing work to UI.
  running.sort((a, b) => a[1] - b[1]);
  return { stage: running[0][0] };
}

function isDue(next: Date | null, now: Date): boolean {
  return next == null || next.getTime() <= now.getTime();
}

async function runSeedLane(now: Date): Promise<void> {
  if (mem.seed) return;
  mem.seed = true;
  try {
    invalidateProspectCrawlerSettingsCache();
    const s = await getProspectCrawlerRuntimeSettings();
    if (isProspectCrawlerDisabled() || !s.crawlerEnabled || !s.schedulerEnabled) return;
    if (!isDue(s.nextSeedTickAt, now)) return;
    active.seed = Date.now();
    const interval = s.seedTickIntervalMinutes;
    try {
      await tickSeeds("scheduled");
      await advanceProspectSchedulerAfterTick("seed", interval);
      console.log("[ProspectScheduler] seed tick done");
    } catch (err: unknown) {
      console.warn("[ProspectScheduler] seed tick error:", err instanceof Error ? err.message : err);
    } finally {
      active.seed = null;
    }
  } finally {
    mem.seed = false;
  }
}

async function runCompanyLane(now: Date): Promise<void> {
  if (mem.company) return;
  mem.company = true;
  try {
    invalidateProspectCrawlerSettingsCache();
    const s = await getProspectCrawlerRuntimeSettings();
    if (isProspectCrawlerDisabled() || !s.crawlerEnabled || !s.schedulerEnabled || s.queuePaused) return;
    if (!isDue(s.nextCompanyQueueTickAt, now)) return;
    active.company = Date.now();
    const interval = s.companyQueueTickIntervalMinutes;
    try {
      await tickQueueCompany("scheduled");
      await advanceProspectSchedulerAfterTick("company", interval);
      console.log("[ProspectScheduler] company queue tick done");
    } catch (err: unknown) {
      console.warn("[ProspectScheduler] company queue tick error:", err instanceof Error ? err.message : err);
    } finally {
      active.company = null;
    }
  } finally {
    mem.company = false;
  }
}

async function runEmployeeLane(now: Date): Promise<void> {
  if (mem.employee) return;
  mem.employee = true;
  try {
    invalidateProspectCrawlerSettingsCache();
    const s = await getProspectCrawlerRuntimeSettings();
    if (isProspectCrawlerDisabled() || !s.crawlerEnabled || !s.schedulerEnabled || s.queuePaused) return;
    if (!isDue(s.nextEmployeeQueueTickAt, now)) return;
    active.employee = Date.now();
    const interval = s.employeeQueueTickIntervalMinutes;
    try {
      await tickQueueEmployee("scheduled");
      await advanceProspectSchedulerAfterTick("employee", interval);
      console.log("[ProspectScheduler] employee queue tick done");
    } catch (err: unknown) {
      console.warn("[ProspectScheduler] employee queue tick error:", err instanceof Error ? err.message : err);
    } finally {
      active.employee = null;
    }
  } finally {
    mem.employee = false;
  }
}

async function pollOnce(): Promise<void> {
  const now = new Date();
  await runSeedLane(now);
  await runCompanyLane(now);
  await runEmployeeLane(now);
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startProspectCrawlerScheduler(): void {
  if (intervalHandle) return;
  console.log("[ProspectScheduler] started (30s poll)");
  void pollOnce();
  intervalHandle = setInterval(() => {
    void pollOnce();
  }, POLL_MS);
}
