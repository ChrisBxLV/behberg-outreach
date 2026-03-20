import { eq, and, desc, asc, like, inArray, sql, isNull, isNotNull, lt, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  users, contacts, importBatches, campaigns, sequenceSteps,
  campaignContacts, emailLogs, trackingEvents,
  type InsertUser, type InsertContact, type InsertCampaign,
  type InsertSequenceStep, type InsertEmailLog,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    values[field] = value ?? null;
    updateSet[field] = value ?? null;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Contacts ─────────────────────────────────────────────────────────────────
export async function getContacts(opts: {
  search?: string;
  stage?: string;
  emailStatus?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { contacts: [], total: 0 };

  const conditions = [];
  if (opts.search) {
    conditions.push(
      sql`(${contacts.fullName} LIKE ${`%${opts.search}%`} OR ${contacts.email} LIKE ${`%${opts.search}%`} OR ${contacts.company} LIKE ${`%${opts.search}%`})`
    );
  }
  if (opts.stage) conditions.push(eq(contacts.stage, opts.stage as any));
  if (opts.emailStatus) conditions.push(eq(contacts.emailStatus, opts.emailStatus as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [rows, countResult] = await Promise.all([
    db.select().from(contacts).where(where).orderBy(desc(contacts.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(contacts).where(where),
  ]);

  return { contacts: rows, total: countResult[0]?.count ?? 0 };
}

export async function getContactById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return result[0];
}

export async function createContact(data: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contacts).values(data);
  return result[0];
}

export async function updateContact(id: number, data: Partial<InsertContact>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contacts).set(data).where(eq(contacts.id, id));
}

export async function deleteContacts(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(contacts).where(inArray(contacts.id, ids));
}

export async function bulkUpdateContactStage(ids: number[], stage: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contacts).set({ stage: stage as any }).where(inArray(contacts.id, ids));
}

export async function getAllContactsForSync() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contacts).orderBy(desc(contacts.createdAt));
}

// ─── Import Batches ───────────────────────────────────────────────────────────
export async function createImportBatch(data: {
  batchId: string;
  filename: string;
  totalRows: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(importBatches).values({ ...data, status: "processing" });
}

export async function updateImportBatch(batchId: string, data: {
  importedRows?: number;
  skippedRows?: number;
  status?: "processing" | "completed" | "failed";
  errorLog?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(importBatches).set(data).where(eq(importBatches.batchId, batchId));
}

export async function getImportBatches() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(20);
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
export async function getCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result[0];
}

export async function createCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(campaigns).values(data);
  return result[0];
}

export async function updateCampaign(id: number, data: Partial<InsertCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

export async function deleteCampaign(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(campaigns).where(eq(campaigns.id, id));
}

// ─── Sequence Steps ───────────────────────────────────────────────────────────
export async function getSequenceSteps(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, campaignId))
    .orderBy(asc(sequenceSteps.stepOrder));
}

export async function upsertSequenceStep(data: InsertSequenceStep) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.id) {
    await db.update(sequenceSteps).set(data).where(eq(sequenceSteps.id, data.id));
  } else {
    await db.insert(sequenceSteps).values(data);
  }
}

export async function deleteSequenceStep(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(sequenceSteps).where(eq(sequenceSteps.id, id));
}

export async function deleteSequenceStepsByCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(sequenceSteps).where(eq(sequenceSteps.campaignId, campaignId));
}

// ─── Campaign Contacts ────────────────────────────────────────────────────────
export async function enrollContactsInCampaign(campaignId: number, contactIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const values = contactIds.map(contactId => ({
    campaignId,
    contactId,
    status: "enrolled" as const,
    currentStep: 0,
  }));

  // Insert ignore duplicates
  for (const v of values) {
    await db.insert(campaignContacts).values(v).onDuplicateKeyUpdate({ set: { status: "enrolled" } });
  }

  // Update campaign total count
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(campaignContacts).where(eq(campaignContacts.campaignId, campaignId));
  await db.update(campaigns).set({ totalContacts: countResult[0]?.count ?? 0 }).where(eq(campaigns.id, campaignId));
}

export async function getCampaignContacts(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    cc: campaignContacts,
    contact: contacts,
  })
    .from(campaignContacts)
    .innerJoin(contacts, eq(campaignContacts.contactId, contacts.id))
    .where(eq(campaignContacts.campaignId, campaignId))
    .orderBy(desc(campaignContacts.enrolledAt));
}

export async function getDueEmailJobs() {
  const db = await getDb();
  if (!db) return [];
  // Use sql`` for timestamp comparison to ensure TiDB-compatible format
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return db.select({
    cc: campaignContacts,
    contact: contacts,
    campaign: campaigns,
  })
    .from(campaignContacts)
    .innerJoin(contacts, eq(campaignContacts.contactId, contacts.id))
    .innerJoin(campaigns, eq(campaignContacts.campaignId, campaigns.id))
    .where(
      and(
        eq(campaignContacts.status, "active"),
        eq(campaigns.status, "active"),
        sql`${campaignContacts.nextSendAt} < ${nowStr}`,
        isNotNull(campaignContacts.nextSendAt),
      )
    );
}

export async function updateCampaignContact(id: number, data: Partial<{
  status: "enrolled" | "active" | "completed" | "unsubscribed" | "bounced" | "replied";
  currentStep: number;
  nextSendAt: Date | null;
  completedAt: Date | null;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(campaignContacts).set(data).where(eq(campaignContacts.id, id));
}

// ─── Email Logs ───────────────────────────────────────────────────────────────
export async function createEmailLog(data: InsertEmailLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailLogs).values(data);
  return result[0];
}

export async function getEmailLogByTrackingId(trackingId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(emailLogs).where(eq(emailLogs.trackingId, trackingId)).limit(1);
  return result[0];
}

export async function updateEmailLog(id: number, data: Partial<InsertEmailLog>) {
  const db = await getDb();
  if (!db) return;
  await db.update(emailLogs).set(data).where(eq(emailLogs.id, id));
}

export async function getEmailLogsByContact(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailLogs).where(eq(emailLogs.contactId, contactId)).orderBy(desc(emailLogs.createdAt));
}

export async function getEmailLogsByCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    log: emailLogs,
    contact: contacts,
  })
    .from(emailLogs)
    .innerJoin(contacts, eq(emailLogs.contactId, contacts.id))
    .where(eq(emailLogs.campaignId, campaignId))
    .orderBy(desc(emailLogs.createdAt));
}

export async function recordOpenEvent(trackingId: string, ip: string, userAgent: string) {
  const db = await getDb();
  if (!db) return;

  const maskedIp = (() => {
    const value = (ip ?? "").trim();
    if (!value) return "";
    // Basic IPv4 masking: 192.168.1.42 -> 192.168.1.0
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
      const parts = value.split(".");
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    // Basic IPv6 masking: keep first 4 hextets, zero the rest
    if (value.includes(":")) {
      const parts = value.split(":");
      const head = parts.slice(0, 4).join(":");
      return `${head}::`;
    }
    return value;
  })();

  const normalizedUa = (userAgent ?? "").slice(0, 512);

  // Record tracking event
  await db
    .insert(trackingEvents)
    .values({
      trackingId,
      eventType: "open",
      ipAddress: maskedIp,
      userAgent: normalizedUa,
    });

  // Update email log
  const log = await getEmailLogByTrackingId(trackingId);
  if (!log) return;

  const openCount = (log.openCount ?? 0) + 1;
  const openedAt = log.openedAt ?? new Date();
  await db.update(emailLogs).set({ openedAt, openCount }).where(eq(emailLogs.trackingId, trackingId));

  // Update campaign open count (only first open per email)
  if (!log.openedAt) {
    await db.update(campaigns)
      .set({ openCount: sql`${campaigns.openCount} + 1` })
      .where(eq(campaigns.id, log.campaignId));
  }
}

export async function markEmailReplied(emailLogId: number) {
  const db = await getDb();
  if (!db) return;
  const log = await db.select().from(emailLogs).where(eq(emailLogs.id, emailLogId)).limit(1);
  if (!log[0]) return;

  await db.update(emailLogs).set({ repliedAt: new Date() }).where(eq(emailLogs.id, emailLogId));

  if (!log[0].repliedAt) {
    await db.update(campaigns)
      .set({ replyCount: sql`${campaigns.replyCount} + 1` })
      .where(eq(campaigns.id, log[0].campaignId));

    // Update campaign contact status
    if (log[0].campaignContactId) {
      await db.update(campaignContacts)
        .set({ status: "replied" })
        .where(eq(campaignContacts.id, log[0].campaignContactId));
    }
  }
}

export async function getCampaignStats(campaignId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  return result[0];
}

export async function unsubscribeByTrackingId(trackingId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const log = await getEmailLogByTrackingId(trackingId);
  if (!log) return false;

  // Mark contact unsubscribed
  await db.update(contacts).set({ stage: "unsubscribed" }).where(eq(contacts.id, log.contactId));

  // Mark enrollment unsubscribed (if present)
  if (log.campaignContactId) {
    await db
      .update(campaignContacts)
      .set({ status: "unsubscribed" })
      .where(eq(campaignContacts.id, log.campaignContactId));
  }

  // Record click event for auditability (minimal data)
  await db.insert(trackingEvents).values({ trackingId, eventType: "click" });

  return true;
}
