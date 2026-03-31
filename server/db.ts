import { eq, and, desc, asc, like, inArray, sql, isNull, isNotNull, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { TRPCError } from "@trpc/server";
import {
  users, organizations, contacts, importBatches, campaigns, sequenceSteps,
  campaignContacts, emailLogs, trackingEvents, loginChallenges,
  signalProfiles, signals, signalInsights, signalIngestionRuns,
  type InsertUser, type InsertContact, type InsertCampaign,
  type InsertSequenceStep, type InsertEmailLog, type InsertLoginChallenge,
  type InsertSignalProfile, type InsertSignal, type InsertSignalInsight,
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
import {
  devCompleteSignalIngestionRun,
  devCreateSignalIngestionRun,
  devGetEnabledSignalProfiles,
  devGetSignalProfile,
  devListSignalFacets,
  devListSignalsForDedupe,
  devListSignals,
  devResetSignalsForOrganization,
  devUpsertSignalInsight,
  devUpsertSignalItem,
  devUpsertSignalProfile,
  devDeleteSignalAndInsight,
  devBackfillSignalHeadlinesFromRawTitle,
} from "./devLocalSignalsStore";

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

  try {
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (err: any) {
    // SECURITY: Only allow dev-file fallback outside of production.
    if (ENV.isProduction) throw err;
    // If MySQL schema is behind (missing columns), allow local dev to continue via file store.
    // This keeps auth usable while you run migrations.
    await devUpsertUser(user);
  }
}

export async function getUserByOpenId(openId: string) {
  if (ENV.useDevFileAuth) {
    return devGetUserByOpenId(openId);
  }
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result[0];
  } catch (err: any) {
    // SECURITY: Only allow dev-file fallback outside of production.
    if (ENV.isProduction) throw err;
    return devGetUserByOpenId(openId);
  }
}

export async function getUserByEmail(email: string) {
  if (ENV.useDevFileAuth) {
    return devGetUserByEmail(email);
  }
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0];
  } catch (err: any) {
    // SECURITY: Only allow dev-file fallback outside of production.
    if (ENV.isProduction) throw err;
    return devGetUserByEmail(email);
  }
}

export async function createOrganizationRecord(name: string): Promise<number> {
  if (ENV.useDevFileAuth) {
    return devCreateOrganization(name);
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.insert(organizations).values({ name: name.trim() });
    const rows = await db
      .select({ id: organizations.id })
      .from(organizations)
      .orderBy(desc(organizations.id))
      .limit(1);
    const id = rows[0]?.id;
    if (id == null) throw new Error("Failed to create organization");
    return id;
  } catch (err: any) {
    // SECURITY: Only allow dev-file fallback outside of production.
    if (ENV.isProduction) throw err;
    return devCreateOrganization(name);
  }
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
  try {
    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return result[0];
  } catch (err: any) {
    // SECURITY: Only allow dev-file fallback outside of production.
    if (ENV.isProduction) throw err;
    const row = await devGetOrganizationById(id);
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      createdAt: new Date(row.createdAt),
    };
  }
}

export async function listOrganizationMembers(organizationId: number) {
  if (ENV.useDevFileAuth) {
    return devListOrganizationMembers(organizationId);
  }
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        orgMemberRole: users.orgMemberRole,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .where(eq(users.organizationId, organizationId));
  } catch (err: any) {
    // SECURITY: Only allow dev-file fallback outside of production.
    if (ENV.isProduction) throw err;
    return devListOrganizationMembers(organizationId);
  }
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
  country?: string;
  industry?: string;
  keywords?: string;
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
  if (opts.country) {
    conditions.push(like(contacts.location, `%${opts.country}%`));
  }
  if (opts.industry) {
    conditions.push(eq(contacts.industry, opts.industry));
  }
  if (opts.keywords) {
    const keywords = opts.keywords
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (keywords.length > 0) {
      const keywordConditions = keywords.map(
        (keyword) =>
          sql`(${contacts.fullName} LIKE ${`%${keyword}%`} OR ${contacts.email} LIKE ${`%${keyword}%`} OR ${contacts.company} LIKE ${`%${keyword}%`} OR ${contacts.title} LIKE ${`%${keyword}%`} OR ${contacts.industry} LIKE ${`%${keyword}%`} OR ${contacts.location} LIKE ${`%${keyword}%`} OR ${contacts.notes} LIKE ${`%${keyword}%`} OR CAST(${contacts.tags} AS CHAR) LIKE ${`%${keyword}%`})`,
      );
      conditions.push(sql`(${sql.join(keywordConditions, sql` OR `)})`);
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [rows, countResult] = await Promise.all([
    db.select().from(contacts).where(where).orderBy(desc(contacts.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(contacts).where(where),
  ]);

  return { contacts: rows, total: countResult[0]?.count ?? 0 };
}

export async function getContactFilterOptions(scopeOrganizationId?: number | null) {
  const db = await getDb();
  if (!db) return { industries: [], countries: [] };

  const conditions = [];
  if (scopeOrganizationId != null) {
    conditions.push(eq(contacts.organizationId, scopeOrganizationId));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [industryRows, locationRows] = await Promise.all([
    db
      .select({ industry: contacts.industry })
      .from(contacts)
      .where(where)
      .orderBy(asc(contacts.industry)),
    db
      .select({ location: contacts.location })
      .from(contacts)
      .where(where)
      .orderBy(asc(contacts.location)),
  ]);

  const industries = Array.from(
    new Set(industryRows.map((row) => row.industry?.trim()).filter(Boolean) as string[]),
  );

  const countries = Array.from(
    new Set(
      locationRows
        .map((row) => row.location?.trim())
        .filter(Boolean)
        .map((location) => {
          const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
          return parts[parts.length - 1] ?? location;
        })
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return { industries, countries };
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

// ─── Signals ──────────────────────────────────────────────────────────────────
export async function getSignalProfile(organizationId: number) {
  if (ENV.useDevFileAuth) {
    return devGetSignalProfile(organizationId);
  }
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(signalProfiles)
    .where(eq(signalProfiles.organizationId, organizationId))
    .limit(1);
  return rows[0];
}

export async function upsertSignalProfile(
  organizationId: number,
  data: Omit<InsertSignalProfile, "organizationId">,
) {
  if (ENV.useDevFileAuth) {
    await devUpsertSignalProfile(organizationId, data);
    return;
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(signalProfiles)
    .values({
      organizationId,
      businessType: data.businessType,
      selectedTags: data.selectedTags ?? [],
      selectedSignalTypes: data.selectedSignalTypes ?? [],
      sourcesEnabled: data.sourcesEnabled ?? [],
      refreshCadenceMinutes: data.refreshCadenceMinutes ?? 30,
      isEnabled: data.isEnabled ?? false,
    })
    .onDuplicateKeyUpdate({
      set: {
        businessType: data.businessType,
        selectedTags: data.selectedTags ?? [],
        selectedSignalTypes: data.selectedSignalTypes ?? [],
        sourcesEnabled: data.sourcesEnabled ?? [],
        refreshCadenceMinutes: data.refreshCadenceMinutes ?? 30,
        isEnabled: data.isEnabled ?? false,
      },
    });
}

export async function getEnabledSignalProfiles() {
  if (ENV.useDevFileAuth) {
    return devGetEnabledSignalProfiles();
  }
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(signalProfiles)
    .where(eq(signalProfiles.isEnabled, true))
    .orderBy(asc(signalProfiles.updatedAt));
}

export async function createSignalIngestionRun(input: {
  organizationId: number;
  source: string;
}) {
  if (ENV.useDevFileAuth) {
    return devCreateSignalIngestionRun(input);
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const res = await db
    .insert(signalIngestionRuns)
    .values({
      organizationId: input.organizationId,
      source: input.source,
      status: "started",
      startedAt: new Date(),
    });
  return Number((res as any).insertId ?? 0);
}

export async function completeSignalIngestionRun(input: {
  id: number;
  status: "completed" | "failed";
  fetchedCount?: number;
  insertedCount?: number;
  summarizedCount?: number;
  errorMessage?: string;
}) {
  if (ENV.useDevFileAuth) {
    await devCompleteSignalIngestionRun(input);
    return;
  }
  const db = await getDb();
  if (!db) return;
  await db
    .update(signalIngestionRuns)
    .set({
      status: input.status,
      fetchedCount: input.fetchedCount ?? 0,
      insertedCount: input.insertedCount ?? 0,
      summarizedCount: input.summarizedCount ?? 0,
      errorMessage: input.errorMessage,
      finishedAt: new Date(),
    })
    .where(eq(signalIngestionRuns.id, input.id));
}

export async function upsertSignalItem(
  data: InsertSignal,
): Promise<{ inserted: boolean; id: number | null }> {
  if (ENV.useDevFileAuth) {
    return devUpsertSignalItem(data);
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select({ id: signals.id })
    .from(signals)
    .where(eq(signals.externalId, data.externalId))
    .limit(1);
  if (existing[0]?.id) {
    await db
      .update(signals)
      .set({
        headline: data.headline,
        url: data.url,
        tags: data.tags ?? [],
        rawPayload: data.rawPayload ?? null,
        occurredAt: data.occurredAt,
      })
      .where(eq(signals.id, existing[0].id));
    return { inserted: false, id: existing[0].id };
  }
  const res = await db.insert(signals).values(data);
  return { inserted: true, id: Number((res as any).insertId ?? 0) };
}

export async function upsertSignalInsight(
  signalId: number,
  data: Omit<InsertSignalInsight, "signalId">,
) {
  if (ENV.useDevFileAuth) {
    await devUpsertSignalInsight(signalId, data);
    return;
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(signalInsights)
    .values({
      signalId,
      summaryShort: data.summaryShort,
      actionSuggestion: data.actionSuggestion,
      reasoning: data.reasoning,
      relevanceScore: data.relevanceScore ?? 0,
      vertical: data.vertical,
    })
    .onDuplicateKeyUpdate({
      set: {
        summaryShort: data.summaryShort,
        actionSuggestion: data.actionSuggestion,
        reasoning: data.reasoning,
        relevanceScore: data.relevanceScore ?? 0,
        vertical: data.vertical,
      },
    });
}

export async function listSignals(opts: {
  organizationId: number;
  limit?: number;
  offset?: number;
  search?: string;
  source?: string;
  tag?: string;
  signalType?: string;
}) {
  if (ENV.useDevFileAuth) {
    return devListSignals(opts);
  }
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const conditions = [eq(signals.organizationId, opts.organizationId)];
  if (opts.search?.trim()) {
    conditions.push(
      sql`(${signals.companyName} LIKE ${`%${opts.search}%`} OR ${signals.headline} LIKE ${`%${opts.search}%`})`,
    );
  }
  if (opts.source) conditions.push(eq(signals.source, opts.source));
  if (opts.signalType) conditions.push(eq(signals.signalType, opts.signalType));
  if (opts.tag) {
    conditions.push(sql`JSON_CONTAINS(${signals.tags}, JSON_QUOTE(${opts.tag}))`);
  }
  const where = and(...conditions);
  const limit = opts.limit ?? 30;
  const offset = opts.offset ?? 0;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: signals.id,
        companyName: signals.companyName,
        signalType: signals.signalType,
        source: signals.source,
        occurredAt: signals.occurredAt,
        url: signals.url,
        rawPayload: signals.rawPayload,
        tags: signals.tags,
        summaryShort: signalInsights.summaryShort,
        summaryDetail: signalInsights.reasoning,
        actionSuggestion: signalInsights.actionSuggestion,
      })
      .from(signals)
      .leftJoin(signalInsights, eq(signalInsights.signalId, signals.id))
      .where(where)
      .orderBy(desc(signals.occurredAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(signals).where(where),
  ]);

  const mapped = rows.map(row => {
      const rawTitle = (row.rawPayload as { title?: unknown } | null)?.title;
      const preferredHeadline =
        typeof rawTitle === "string" && rawTitle.trim().length > 0
          ? rawTitle.trim()
          : row.summaryShort ?? row.companyName;
      return {
        ...row,
        tags: row.tags ?? [],
        summaryShort: preferredHeadline,
        summaryDetail: row.summaryDetail ?? row.companyName,
        companyWebsite:
          (row.rawPayload as { companyWebsite?: string } | null)?.companyWebsite ?? row.url,
        website_url:
          (row.rawPayload as { extraction?: { website_url?: string | null } } | null)?.extraction
            ?.website_url ?? null,
        actionSuggestion: row.actionSuggestion ?? "No suggested action generated yet.",
      };
    });

  const dedupeKey = (item: { companyName: string; signalType: string; summaryShort: string }) =>
    `${item.companyName}|${item.signalType}|${item.summaryShort}`
      .toLowerCase()
      .replace(/[^a-z0-9|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const deduped: typeof mapped = [];
  const seen = new Set<string>();
  for (const item of mapped) {
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return {
    items: deduped,
    total: countRows[0]?.count ?? 0,
  };
}

export async function listSignalFacets(organizationId: number) {
  if (ENV.useDevFileAuth) {
    return devListSignalFacets(organizationId);
  }
  const db = await getDb();
  if (!db) return { sources: [], signalTypes: [], tags: [] };
  const rows = await db
    .select({
      source: signals.source,
      signalType: signals.signalType,
      tags: signals.tags,
    })
    .from(signals)
    .where(eq(signals.organizationId, organizationId))
    .orderBy(desc(signals.occurredAt))
    .limit(400);

  const sourceSet = new Set<string>();
  const signalTypeSet = new Set<string>();
  const tagSet = new Set<string>();
  for (const row of rows) {
    if (row.source) sourceSet.add(row.source);
    if (row.signalType) signalTypeSet.add(row.signalType);
    for (const tag of row.tags ?? []) tagSet.add(tag);
  }
  return {
    sources: Array.from(sourceSet).sort((a, b) => a.localeCompare(b)),
    signalTypes: Array.from(signalTypeSet).sort((a, b) => a.localeCompare(b)),
    tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
  };
}

export async function resetSignalsForOrganization(organizationId: number) {
  if (ENV.useDevFileAuth) {
    await devResetSignalsForOrganization(organizationId);
    return;
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const signalIdsRows = await db
    .select({ id: signals.id })
    .from(signals)
    .where(eq(signals.organizationId, organizationId));
  const signalIds = signalIdsRows.map(row => row.id);

  if (signalIds.length > 0) {
    await db.delete(signalInsights).where(inArray(signalInsights.signalId, signalIds));
  }
  await db.delete(signals).where(eq(signals.organizationId, organizationId));
  await db.delete(signalIngestionRuns).where(eq(signalIngestionRuns.organizationId, organizationId));
  await db.delete(signalProfiles).where(eq(signalProfiles.organizationId, organizationId));
}

export async function listSignalsForDedupe(opts: {
  organizationId: number;
  companyName: string;
  signalType: string;
  since: Date;
  limit?: number;
}): Promise<
  Array<{
    id: number;
    occurredAt: Date;
    summaryText: string;
    confidence: number;
  }>
> {
  if (ENV.useDevFileAuth) {
    return devListSignalsForDedupe(opts);
  }
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: signals.id,
      occurredAt: signals.occurredAt,
      rawPayload: signals.rawPayload,
      summaryShort: signalInsights.summaryShort,
    })
    .from(signals)
    .innerJoin(signalInsights, eq(signalInsights.signalId, signals.id))
    .where(
      and(
        eq(signals.organizationId, opts.organizationId),
        eq(signals.companyName, opts.companyName),
        eq(signals.signalType, opts.signalType),
        gt(signals.occurredAt, opts.since),
      ),
    )
    .orderBy(desc(signals.occurredAt))
    .limit(opts.limit ?? 100);

  return rows.map(row => {
    const extraction = (row.rawPayload?.extraction ?? null) as
      | { summary?: unknown; confidence?: unknown }
      | null;
    const summaryText =
      typeof extraction?.summary === "string" && extraction.summary.trim().length > 0
        ? extraction.summary
        : row.summaryShort;
    const confidenceNum = Number(extraction?.confidence ?? 0);
    const confidence = Number.isFinite(confidenceNum) ? confidenceNum : 0;
    return {
      id: row.id,
      occurredAt: row.occurredAt,
      summaryText: String(summaryText),
      confidence,
    };
  });
}

export async function deleteSignalAndInsight(signalId: number): Promise<void> {
  if (ENV.useDevFileAuth) {
    await devDeleteSignalAndInsight(signalId);
    return;
  }
  const db = await getDb();
  if (!db) return;
  await db.delete(signalInsights).where(eq(signalInsights.signalId, signalId));
  await db.delete(signals).where(eq(signals.id, signalId));
}

export async function backfillSignalHeadlinesFromRawTitle(
  organizationId?: number,
): Promise<{ updated: number }> {
  if (ENV.useDevFileAuth) {
    return devBackfillSignalHeadlinesFromRawTitle(organizationId);
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const signalRows = await db
    .select({
      id: signals.id,
      organizationId: signals.organizationId,
      headline: signals.headline,
      rawPayload: signals.rawPayload,
    })
    .from(signals)
    .where(organizationId == null ? undefined : eq(signals.organizationId, organizationId));

  if (signalRows.length === 0) return { updated: 0 };

  const signalIds = signalRows.map(r => r.id);
  const insightRows = await db
    .select({
      id: signalInsights.id,
      signalId: signalInsights.signalId,
      reasoning: signalInsights.reasoning,
      relevanceScore: signalInsights.relevanceScore,
      vertical: signalInsights.vertical,
    })
    .from(signalInsights)
    .where(inArray(signalInsights.signalId, signalIds));
  const insightBySignalId = new Map(insightRows.map(r => [r.signalId, r]));

  let updated = 0;
  for (const row of signalRows) {
    const rawTitle = (row.rawPayload as { title?: unknown } | null)?.title;
    const title =
      typeof rawTitle === "string" && rawTitle.trim().length > 0
        ? rawTitle.trim()
        : row.headline;
    const existing = insightBySignalId.get(row.id);
    if (existing) {
      await db
        .update(signalInsights)
        .set({
          summaryShort: title,
          actionSuggestion: "",
        })
        .where(eq(signalInsights.signalId, row.id));
    } else {
      await db.insert(signalInsights).values({
        signalId: row.id,
        summaryShort: title,
        actionSuggestion: "",
        reasoning: null,
        relevanceScore: 0,
        vertical: null,
      });
    }
    updated += 1;
  }
  return { updated };
}
