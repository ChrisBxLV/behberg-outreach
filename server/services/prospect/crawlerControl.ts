import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { prospectCrawlerSettings } from "../../../drizzle/schema";
import {
  clampProspectCrawlerScheduleForPersist,
  computeProspectNextSchedulerTick,
  invalidateProspectCrawlerSettingsCache,
  type ProspectCrawlerSchedulePersistInput,
} from "./crawlerSettings";

const SETTINGS_ID = 1;

export async function startProspectCrawler(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  await db
    .update(prospectCrawlerSettings)
    .set({
      crawlerEnabled: true,
      schedulerEnabled: true,
      queuePaused: false,
      nextSeedTickAt: now,
      nextCompanyQueueTickAt: now,
      nextEmployeeQueueTickAt: now,
      updatedByUserId: userId,
    })
    .where(eq(prospectCrawlerSettings.id, SETTINGS_ID));
  invalidateProspectCrawlerSettingsCache();
}

export async function stopProspectCrawler(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  await db
    .update(prospectCrawlerSettings)
    .set({
      crawlerEnabled: false,
      schedulerEnabled: false,
      queuePaused: false,
      lastStopAt: now,
      lastStopByUserId: userId,
      updatedByUserId: userId,
    })
    .where(eq(prospectCrawlerSettings.id, SETTINGS_ID));
  invalidateProspectCrawlerSettingsCache();
}

export async function pauseProspectCrawlerQueue(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(prospectCrawlerSettings)
    .set({ queuePaused: true, updatedByUserId: userId })
    .where(eq(prospectCrawlerSettings.id, SETTINGS_ID));
  invalidateProspectCrawlerSettingsCache();
}

export async function resumeProspectCrawlerQueue(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(prospectCrawlerSettings)
    .set({ queuePaused: false, updatedByUserId: userId })
    .where(eq(prospectCrawlerSettings.id, SETTINGS_ID));
  invalidateProspectCrawlerSettingsCache();
}

export async function recordProspectCrawlerManualRun(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(prospectCrawlerSettings)
    .set({
      lastManualRunAt: new Date(),
      lastManualRunByUserId: userId,
      updatedByUserId: userId,
    })
    .where(eq(prospectCrawlerSettings.id, SETTINGS_ID));
  invalidateProspectCrawlerSettingsCache();
}

export async function updateProspectCrawlerScheduleDb(
  userId: number,
  input: ProspectCrawlerSchedulePersistInput,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const c = clampProspectCrawlerScheduleForPersist(input);
  await db
    .update(prospectCrawlerSettings)
    .set({
      schedulerEnabled: c.schedulerEnabled,
      seedTickIntervalMinutes: c.seedTickIntervalMinutes,
      companyQueueTickIntervalMinutes: c.companyQueueTickIntervalMinutes,
      employeeQueueTickIntervalMinutes: c.employeeQueueTickIntervalMinutes,
      updatedByUserId: userId,
    })
    .where(eq(prospectCrawlerSettings.id, SETTINGS_ID));
  invalidateProspectCrawlerSettingsCache();
}

export async function advanceProspectSchedulerAfterTick(
  stage: "seed" | "company" | "employee",
  intervalMinutes: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const ended = new Date();
  const next = computeProspectNextSchedulerTick(ended, intervalMinutes);
  if (stage === "seed") {
    await db
      .update(prospectCrawlerSettings)
      .set({ lastSeedTickAt: ended, nextSeedTickAt: next })
      .where(eq(prospectCrawlerSettings.id, SETTINGS_ID));
  } else if (stage === "company") {
    await db
      .update(prospectCrawlerSettings)
      .set({ lastCompanyQueueTickAt: ended, nextCompanyQueueTickAt: next })
      .where(eq(prospectCrawlerSettings.id, SETTINGS_ID));
  } else {
    await db
      .update(prospectCrawlerSettings)
      .set({ lastEmployeeQueueTickAt: ended, nextEmployeeQueueTickAt: next })
      .where(eq(prospectCrawlerSettings.id, SETTINGS_ID));
  }
  invalidateProspectCrawlerSettingsCache();
}
