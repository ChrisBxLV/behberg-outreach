import { eq, and, desc, asc, like, inArray, sql, isNull, isNotNull, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { TRPCError } from "@trpc/server";
import {
  users, organizations, contacts, importBatches, campaigns, sequenceSteps,
  campaignContacts, emailLogs, trackingEvents, loginChallenges,
  type InsertUser, type InsertContact, type InsertCampaign,
  type InsertSequenceStep, type InsertEmailLog, type InsertLoginChallenge,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { agentDebugLog } from "./_core/agentDebugLog";
import {
  devAbandonLatestUnusedChallenge,
  devCreateLoginChallenge,
  devCreateOrganization,
  devGetOrganizationById,
  devGetUserByEmail,
  devGetUserByOpenId,
  devListOrganizationMembers,
  devUpsertUser,
  devVerifyLoginChallenge,
} from "./devLocalAuthStore";

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
  if (ENV.useDevFileAuth) {
    await devUpsertUser(user);
    return;
  }
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod", "passwordSalt", "passwordHash"] as const;

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

  if (user.organizationId !== undefined) {
    values.organizationId = user.organizationId;
    updateSet.organizationId = user.organizationId;
  }
  if (user.orgMemberRole !== undefined) {
    values.orgMemberRole = user.orgMemberRole;
    updateSet.orgMemberRole = user.orgMemberRole;
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  if (ENV.useDevFileAuth) {
    return devGetUserByOpenId(openId);
  }
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  if (ENV.useDevFileAuth) {
    return devGetUserByEmail(email);
  }
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function createOrganizationRecord(name: string): Promise<number> {
  if (ENV.useDevFileAuth) {
    return devCreateOrganization(name);
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(organizations).values({ name: name.trim() });
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(desc(organizations.id))
    .limit(1);
  const id = rows[0]?.id;
  if (id == null) throw new Error("Failed to create organization");
  return id;
}

export async function getOrganizationById(id: number) {
  if (ENV.useDevFileAuth) {
    const row = await devGetOrganizationById(id);
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      createdAt: new Date(row.createdAt),
    };
  }
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return result[0];
}

export async function listOrganizationMembers(organizationId: number) {
  if (ENV.useDevFileAuth) {
    return devListOrganizationMembers(organizationId);
  }
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      orgMemberRole: users.orgMemberRole,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .where(eq(users.organizationId, organizationId));
}

type CreateLoginChallengeInput = {
  email: string;
  codeHash: string;
  expiresAt: Date;
  requestIp?: string | null;
  cooldownSeconds?: number;
  maxAttempts?: number;
};

export async function createLoginChallenge(input: CreateLoginChallengeInput) {
  if (ENV.useDevFileAuth) {
    return devCreateLoginChallenge(input);
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const cooldownSeconds = input.cooldownSeconds ?? 60;
  const maxAttempts = input.maxAttempts ?? 5;
  const now = new Date();

  const latest = await db
    .select()
    .from(loginChallenges)
    .where(and(eq(loginChallenges.email, input.email), isNull(loginChallenges.usedAt), gt(loginChallenges.expiresAt, now)))
    .orderBy(desc(loginChallenges.createdAt))
    .limit(1);

  const activeChallenge = latest[0];
  if (activeChallenge?.createdAt) {
    const createdAtMs = activeChallenge.createdAt.getTime();
    const cooldownMs = cooldownSeconds * 1000;
    const retryAfterMs = createdAtMs + cooldownMs - now.getTime();
    if (retryAfterMs > 0) {
      return {
        sent: false as const,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }
  }

  const values: InsertLoginChallenge = {
    email: input.email,
    codeHash: input.codeHash,
    expiresAt: input.expiresAt,
    requestIp: input.requestIp ?? null,
    maxAttempts,
  };
  await db.insert(loginChallenges).values(values);

  return { sent: true as const, retryAfterSeconds: 0 };
}

/** Drop the newest unused OTP challenge so a failed email send does not trap the user in cooldown. */
export async function abandonLatestUnusedLoginChallenge(email: string) {
  const normalized = email.trim().toLowerCase();
  if (ENV.useDevFileAuth) {
    await devAbandonLatestUnusedChallenge(normalized);
    return;
  }
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const rows = await db
    .select({ id: loginChallenges.id })
    .from(loginChallenges)
    .where(
      and(
        eq(loginChallenges.email, normalized),
        isNull(loginChallenges.usedAt),
        gt(loginChallenges.expiresAt, now),
      ),
    )
    .orderBy(desc(loginChallenges.createdAt))
    .limit(1);
  const id = rows[0]?.id;
  if (id !== undefined) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
  }
}

export async function verifyLoginChallenge(email: string, submittedCodeHash: string) {
  if (ENV.useDevFileAuth) {
    return devVerifyLoginChallenge(email, submittedCodeHash);
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const rows = await db
    .select()
    .from(loginChallenges)
    .where(and(eq(loginChallenges.email, email), isNull(loginChallenges.usedAt)))
    .orderBy(desc(loginChallenges.createdAt))
    .limit(1);

  const challenge = rows[0];
  if (!challenge) return { ok: false as const, reason: "invalid" as const };
  if (challenge.expiresAt <= now) return { ok: false as const, reason: "expired" as const };
  if ((challenge.attemptCount ?? 0) >= challenge.maxAttempts) {
    return { ok: false as const, reason: "too_many_attempts" as const };
  }

  if (challenge.codeHash !== submittedCodeHash) {
    await db
      .update(loginChallenges)
      .set({ attemptCount: sql`${loginChallenges.attemptCount} + 1` })
      .where(eq(loginChallenges.id, challenge.id));
    return { ok: false as const, reason: "invalid" as const };
  }

  await db
    .update(loginChallenges)
    .set({ usedAt: now })
    .where(and(eq(loginChallenges.id, challenge.id), isNull(loginChallenges.usedAt)));

  return { ok: true as const };
}

// ─── Contacts ─────────────────────────────────────────────────────────────────
export async function getContacts(opts: {
  search?: string;
  stage?: string;
  emailStatus?: string;
  limit?: number;
  offset?: number;
  /** When set, only rows for this organization (tenant scope). */
  scopeOrganizationId?: number | null;
}) {
  const db = await getDb();
  if (!db) return { contacts: [], total: 0 };

  const conditions = [];
  if (opts.scopeOrganizationId != null) {
    conditions.push(eq(contacts.organizationId, opts.scopeOrganizationId));
  }
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

export async function getContactById(id: number, scopeOrganizationId?: number | null) {
  const db = await getDb();
  if (!db) return undefined;
  const conds = [eq(contacts.id, id)];
  if (scopeOrganizationId != null) {
    conds.push(eq(contacts.organizationId, scopeOrganizationId));
  }
  const result = await db.select().from(contacts).where(and(...conds)).limit(1);
  return result[0];
}

export async function createContact(data: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contacts).values(data);
  return result[0];
}

export async function updateContact(
  id: number,
  data: Partial<InsertContact>,
  scopeOrganizationId?: number | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [eq(contacts.id, id)];
  if (scopeOrganizationId != null) {
    conds.push(eq(contacts.organizationId, scopeOrganizationId));
  }
  await db.update(contacts).set(data).where(and(...conds));
}

export async function deleteContacts(ids: number[], scopeOrganizationId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [inArray(contacts.id, ids)];
  if (scopeOrganizationId != null) {
    conds.push(eq(contacts.organizationId, scopeOrganizationId));
  }
  await db.delete(contacts).where(and(...conds));
}

export async function bulkUpdateContactStage(
  ids: number[],
  stage: string,
  scopeOrganizationId?: number | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [inArray(contacts.id, ids)];
  if (scopeOrganizationId != null) {
    conds.push(eq(contacts.organizationId, scopeOrganizationId));
  }
  await db.update(contacts).set({ stage: stage as any }).where(and(...conds));
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
export async function getCampaigns(scopeOrganizationId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (scopeOrganizationId != null) {
    return db
      .select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, scopeOrganizationId))
      .orderBy(desc(campaigns.createdAt));
  }
  return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

export async function getCampaignById(id: number, scopeOrganizationId?: number | null) {
  const db = await getDb();
  if (!db) return undefined;
  const conds = [eq(campaigns.id, id)];
  if (scopeOrganizationId != null) {
    conds.push(eq(campaigns.organizationId, scopeOrganizationId));
  }
  const result = await db.select().from(campaigns).where(and(...conds)).limit(1);
  return result[0];
}

export async function createCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(campaigns).values(data);
  return result[0];
}

export async function updateCampaign(
  id: number,
  data: Partial<InsertCampaign>,
  scopeOrganizationId?: number | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [eq(campaigns.id, id)];
  if (scopeOrganizationId != null) {
    conds.push(eq(campaigns.organizationId, scopeOrganizationId));
  }
  await db.update(campaigns).set(data).where(and(...conds));
}

export async function deleteCampaign(id: number, scopeOrganizationId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [eq(campaigns.id, id)];
  if (scopeOrganizationId != null) {
    conds.push(eq(campaigns.organizationId, scopeOrganizationId));
  }
  await db.delete(campaigns).where(and(...conds));
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

export async function markEmailReplied(
  emailLogId: number,
  scopeOrganizationId?: number | null,
) {
  const db = await getDb();
  if (!db) return;

  const rows = await db
    .select({ log: emailLogs, campaign: campaigns })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(eq(emailLogs.id, emailLogId))
    .limit(1);

  const row = rows[0];
  if (!row) return;

  // Enforce tenant isolation: email logs can only be replied by users in the same organization.
  const campaignOrgId = row.campaign.organizationId ?? null;
  if (scopeOrganizationId != null && campaignOrgId !== scopeOrganizationId) {
    agentDebugLog({
      runId: "post-fix",
      hypothesisId: "H_TENANT_MARK_REPLIED",
      location: "server/db.ts:markEmailReplied-scope-check",
      message: "Blocked markReplied due to org scope mismatch",
      data: { scopeOrganizationId, campaignOrgId, emailLogId },
    });
    throw new TRPCError({ code: "NOT_FOUND", message: "Email log not found" });
  }

  await db.update(emailLogs).set({ repliedAt: new Date() }).where(eq(emailLogs.id, emailLogId));

  if (!row.log.repliedAt) {
    await db.update(campaigns)
      .set({ replyCount: sql`${campaigns.replyCount} + 1` })
      .where(eq(campaigns.id, row.log.campaignId));

    // Update campaign contact status
    if (row.log.campaignContactId) {
      await db.update(campaignContacts)
        .set({ status: "replied" })
        .where(eq(campaignContacts.id, row.log.campaignContactId));
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
