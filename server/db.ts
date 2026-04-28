import { eq, and, desc, asc, like, inArray, sql, isNull, isNotNull, gt, count, ne, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { TRPCError } from "@trpc/server";
import {
  users, organizations, contacts, enrichmentResults, importBatches, campaigns, sequenceSteps,
  campaignContacts, emailLogs, trackingEvents, loginChallenges,
  signalProfiles, signals, signalInsights, signalIngestionRuns, mailboxes,
  mailboxOauthTokens, mailboxOauthConnectAttempts, mailboxHealth, mailboxSendLimits,   mailboxWebhookSubscriptions,
  mailboxUnsubscribes,
  userDashboardPreferences,
  type InsertUser, type InsertContact, type Contact, type InsertCampaign,
  type InsertSequenceStep, type InsertEmailLog, type InsertLoginChallenge,
  type InsertSignalProfile, type InsertSignal, type InsertSignalInsight,
  type InsertMailbox, type InsertMailboxOauthToken, type InsertMailboxOauthConnectAttempt,
  type InsertEnrichmentResult,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { scopeForContactOrganizationId, type TenantQueryScope } from "./_core/authz";
import { matchesConfiguredDefaultOperatorLogin } from "./_core/orgScope";
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
  const textFields = ["name", "email", "phone", "country", "loginMethod", "passwordSalt", "passwordHash"] as const;

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
  if (user.accountDisabled !== undefined) {
    values.accountDisabled = user.accountDisabled;
    updateSet.accountDisabled = user.accountDisabled;
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

export async function getUserById(id: number) {
  if (ENV.useDevFileAuth) {
    const { devGetUserById } = await import("./devLocalAuthStore");
    return devGetUserById(id);
  }
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  } catch (err: any) {
    if (ENV.isProduction) throw err;
    const { devGetUserById } = await import("./devLocalAuthStore");
    return devGetUserById(id);
  }
}

export async function setUserPositiveRepliesLastSeen(userId: number, at: Date = new Date()) {
  if (ENV.useDevFileAuth) return;
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ positiveRepliesLastSeenAt: at }).where(eq(users.id, userId));
}

export async function getNewPositiveRepliesSummary(organizationId: number, userId: number) {
  if (ENV.useDevFileAuth) {
    return { count: 0, campaigns: [] as { campaignId: number; count: number }[] };
  }
  const db = await getDb();
  if (!db) {
    return { count: 0, campaigns: [] as { campaignId: number; count: number }[] };
  }
  const u = await getUserById(userId);
  const since = u?.positiveRepliesLastSeenAt ?? new Date(0);
  const rows = await db
    .select({
      campaignId: emailLogs.campaignId,
      n: count(),
    })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        eq(emailLogs.replySentiment, "positive"),
        isNotNull(emailLogs.repliedAt),
        gt(emailLogs.repliedAt, since),
      ),
    )
    .groupBy(emailLogs.campaignId);
  const total = rows.reduce((s, r) => s + Number(r.n), 0);
  return {
    count: total,
    campaigns: rows.map(r => ({ campaignId: r.campaignId, count: Number(r.n) })),
  };
}

export type PlatformUserRow = {
  id: number;
  openId: string;
  email: string | null;
  name: string | null;
  role: (typeof users.$inferSelect)["role"];
  organizationId: number | null;
  organizationName: string | null;
  accountDisabled: boolean;
  isDefaultEnvOperator: boolean;
};

export async function listUsersForPlatform(): Promise<PlatformUserRow[]> {
  if (ENV.useDevFileAuth) {
    const { devListUsersForPlatform } = await import("./devLocalAuthStore");
    return devListUsersForPlatform();
  }
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        id: users.id,
        openId: users.openId,
        email: users.email,
        name: users.name,
        role: users.role,
        organizationId: users.organizationId,
        organizationName: organizations.name,
        accountDisabled: users.accountDisabled,
      })
      .from(users)
      .leftJoin(organizations, eq(users.organizationId, organizations.id))
      .orderBy(desc(users.id));
    return rows.map(r => ({
      ...r,
      organizationName: r.organizationName ?? null,
      isDefaultEnvOperator: matchesConfiguredDefaultOperatorLogin(r.openId, r.email, r.name),
    }));
  } catch (err: any) {
    if (ENV.isProduction) throw err;
    const { devListUsersForPlatform } = await import("./devLocalAuthStore");
    return devListUsersForPlatform();
  }
}

/** Active platform superadmins: `role = superadmin`, not disabled, optionally excluding one user id. */
export async function countActiveSuperadminUsersExcluding(excludeUserId: number): Promise<number> {
  if (ENV.useDevFileAuth) {
    const { devCountActiveSuperadminUsersExcluding } = await import("./devLocalAuthStore");
    return devCountActiveSuperadminUsersExcluding(excludeUserId);
  }
  const db = await getDb();
  if (!db) return 0;
  try {
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(
        and(
          eq(users.role, "superadmin"),
          eq(users.accountDisabled, false),
          ne(users.id, excludeUserId),
        ),
      );
    return Number(row?.n ?? 0);
  } catch (err: any) {
    if (ENV.isProduction) throw err;
    const { devCountActiveSuperadminUsersExcluding } = await import("./devLocalAuthStore");
    return devCountActiveSuperadminUsersExcluding(excludeUserId);
  }
}

export async function deleteUserById(userId: number): Promise<void> {
  if (ENV.useDevFileAuth) {
    const { devDeleteUserById } = await import("./devLocalAuthStore");
    await devDeleteUserById(userId);
    return;
  }
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.id, userId));
}

export async function updateUserOpenId(oldOpenId: string, newOpenId: string): Promise<void> {
  const from = oldOpenId.trim();
  const to = newOpenId.trim();
  if (!from) throw new Error("oldOpenId is required");
  if (!to) throw new Error("newOpenId is required");
  if (from === to) return;
  if (ENV.useDevFileAuth) {
    const { devUpdateUserOpenId } = await import("./devLocalAuthStore");
    await devUpdateUserOpenId(from, to);
    return;
  }
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ openId: to }).where(eq(users.openId, from));
}

export async function setOrganizationSubscriptionPlanId(
  organizationId: number,
  planId: string,
): Promise<void> {
  if (ENV.useDevFileAuth) {
    const { devSetOrganizationSubscriptionPlanId } = await import("./devLocalAuthStore");
    await devSetOrganizationSubscriptionPlanId(organizationId, planId);
    return;
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db
      .update(organizations)
      .set({ subscriptionPlanId: planId })
      .where(eq(organizations.id, organizationId));
  } catch (err: any) {
    if (ENV.isProduction) throw err;
    const { devSetOrganizationSubscriptionPlanId } = await import("./devLocalAuthStore");
    await devSetOrganizationSubscriptionPlanId(organizationId, planId);
  }
}

export async function updateOrganizationName(organizationId: number, name: string): Promise<void> {
  const next = name.trim();
  if (next.length < 2) throw new Error("Organization name is required");
  if (ENV.useDevFileAuth) {
    const { devUpdateOrganizationName } = await import("./devLocalAuthStore");
    await devUpdateOrganizationName(organizationId, next);
    return;
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.update(organizations).set({ name: next }).where(eq(organizations.id, organizationId));
  } catch (err: any) {
    if (ENV.isProduction) throw err;
    const { devUpdateOrganizationName } = await import("./devLocalAuthStore");
    await devUpdateOrganizationName(organizationId, next);
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

export type PlatformOverviewOrg = {
  id: number;
  name: string;
  subscriptionPlanId: string;
  createdAt: Date;
  memberCount: number;
  contactCount: number;
};

export type PlatformOverview = {
  organizations: PlatformOverviewOrg[];
  totals: {
    organizations: number;
    users: number;
    contacts: number;
    campaigns: number;
  };
};

function emptyPlatformOverview(): PlatformOverview {
  return {
    organizations: [],
    totals: { organizations: 0, users: 0, contacts: 0, campaigns: 0 },
  };
}

/** Cross-tenant summary for platform superadmin (requires MySQL or dev file store). */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  if (ENV.useDevFileAuth) {
    const { devGetPlatformOverview } = await import("./devLocalAuthStore");
    return devGetPlatformOverview();
  }
  const db = await getDb();
  if (!db) return emptyPlatformOverview();

  try {
    const orgList = await db.select().from(organizations).orderBy(desc(organizations.id));

    const [[userTotal], [contactTotal], [campaignTotal]] = await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(contacts),
      db.select({ n: count() }).from(campaigns),
    ]);

    const orgRows: PlatformOverviewOrg[] = await Promise.all(
      orgList.map(async o => {
        const [[mc], [cc]] = await Promise.all([
          db.select({ n: count() }).from(users).where(eq(users.organizationId, o.id)),
          db.select({ n: count() }).from(contacts).where(eq(contacts.organizationId, o.id)),
        ]);
        return {
          id: o.id,
          name: o.name,
          subscriptionPlanId: o.subscriptionPlanId,
          createdAt: o.createdAt,
          memberCount: Number(mc?.n ?? 0),
          contactCount: Number(cc?.n ?? 0),
        };
      }),
    );

    return {
      organizations: orgRows,
      totals: {
        organizations: orgList.length,
        users: Number(userTotal?.n ?? 0),
        contacts: Number(contactTotal?.n ?? 0),
        campaigns: Number(campaignTotal?.n ?? 0),
      },
    };
  } catch (err: any) {
    if (ENV.isProduction) throw err;
    const { devGetPlatformOverview } = await import("./devLocalAuthStore");
    return devGetPlatformOverview();
  }
}

export async function getOrganizationById(id: number) {
  if (ENV.useDevFileAuth) {
    const row = await devGetOrganizationById(id);
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      subscriptionPlanId: row.subscriptionPlanId ?? "free",
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
      subscriptionPlanId: row.subscriptionPlanId ?? "free",
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
  /** Tenant filter, or platform (cross-tenant) when `type === "platform"`. */
  scope: TenantQueryScope;
}) {
  const db = await getDb();
  if (!db) return { contacts: [], total: 0 };

  const conditions = [];
  if (opts.scope.type === "tenant") {
    conditions.push(eq(contacts.organizationId, opts.scope.organizationId));
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
    db
      .select()
      .from(contacts)
      .where(where)
      // Prefer most recently touched contacts (CSV re-imports / enrich / edits) over original insert time.
      .orderBy(desc(contacts.updatedAt), desc(contacts.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(contacts).where(where),
  ]);

  return { contacts: rows, total: countResult[0]?.count ?? 0 };
}

export async function getContactFilterOptions(scope: TenantQueryScope) {
  const db = await getDb();
  if (!db) return { industries: [], countries: [] };

  const conditions = [];
  if (scope.type === "tenant") {
    conditions.push(eq(contacts.organizationId, scope.organizationId));
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
        .filter((location): location is string => Boolean(location))
        .map((location) => {
          const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
          return parts[parts.length - 1] ?? location;
        })
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return { industries, countries };
}

export async function getContactById(id: number, scope: TenantQueryScope) {
  const db = await getDb();
  if (!db) return undefined;
  const conds = [eq(contacts.id, id)];
  if (scope.type === "tenant") {
    conds.push(eq(contacts.organizationId, scope.organizationId));
  }
  const result = await db.select().from(contacts).where(and(...conds)).limit(1);
  return result[0];
}

export async function updateContactLinkedInUrl(
  contactId: number,
  linkedinUrl: string | null,
  scope: TenantQueryScope,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [eq(contacts.id, contactId)];
  if (scope.type === "tenant") {
    conds.push(eq(contacts.organizationId, scope.organizationId));
  }
  await db.update(contacts).set({ linkedinUrl }).where(and(...conds));
}

export async function updateContactEnrichmentMeta(
  contactId: number,
  patch: Partial<Pick<InsertContact, "normalizedDomain" | "enrichmentStatus" | "enrichmentUpdatedAt">>,
  scope: TenantQueryScope,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [eq(contacts.id, contactId)];
  if (scope.type === "tenant") {
    conds.push(eq(contacts.organizationId, scope.organizationId));
  }
  await db.update(contacts).set(patch).where(and(...conds));
}

/** Remove all enrichment rows for a contact (used by transactional replace, not called on failed runs). */
export async function deleteEnrichmentResultsForContact(
  organizationId: number,
  contactId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(enrichmentResults)
    .where(
      and(eq(enrichmentResults.organizationId, organizationId), eq(enrichmentResults.contactId, contactId)),
    );
}

type EnrichmentResultFieldInput = {
  source: string;
  fieldName: string;
  fieldValue: string;
  confidence: number;
  personalData: boolean;
  rawData?: unknown;
  collectedAt?: Date;
};

/**
 * Atomically replace stored enrichment for a contact: delete old rows, insert the new snapshot, update contact meta.
 * On any error the transaction rolls back and previous enrichment_results remain.
 */
export async function replaceContactEnrichmentSnapshot(
  organizationId: number,
  contactId: number,
  fields: EnrichmentResultFieldInput[],
  patch: {
    normalizedDomain: string | null;
    enrichmentUpdatedAt: Date;
    enrichmentStatus: "enriched" | "no_data_found";
  },
  scope: TenantQueryScope,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const at = patch.enrichmentUpdatedAt;
  const rows: InsertEnrichmentResult[] = fields.map(f => ({
    organizationId,
    contactId,
    source: f.source,
    fieldName: f.fieldName,
    fieldValue: f.fieldValue,
    confidence: Math.max(0, Math.min(100, Math.round(Number(f.confidence ?? 0)))),
    personalData: Boolean(f.personalData),
    rawData: f.rawData ?? null,
    collectedAt: f.collectedAt ?? at,
  }));

  await db.transaction(async tx => {
    await tx
      .delete(enrichmentResults)
      .where(
        and(eq(enrichmentResults.organizationId, organizationId), eq(enrichmentResults.contactId, contactId)),
      );
    if (rows.length) {
      await tx.insert(enrichmentResults).values(rows);
    }
    const conds = [eq(contacts.id, contactId)];
    if (scope.type === "tenant") {
      conds.push(eq(contacts.organizationId, scope.organizationId));
    }
    await tx
      .update(contacts)
      .set({
        normalizedDomain: patch.normalizedDomain,
        enrichmentStatus: patch.enrichmentStatus,
        enrichmentUpdatedAt: at,
      })
      .where(and(...conds));
  });
}

export async function insertEnrichmentResults(
  organizationId: number,
  contactId: number,
  fields: Array<{
    source: string;
    fieldName: string;
    fieldValue: string;
    confidence: number;
    personalData: boolean;
    rawData?: unknown;
    collectedAt?: Date;
  }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  const rows: InsertEnrichmentResult[] = fields.map(f => ({
    organizationId,
    contactId,
    source: f.source,
    fieldName: f.fieldName,
    fieldValue: f.fieldValue,
    confidence: Math.max(0, Math.min(100, Math.round(Number(f.confidence ?? 0)))),
    personalData: Boolean(f.personalData),
    rawData: f.rawData ?? null,
    collectedAt: f.collectedAt ?? now,
  }));
  if (!rows.length) return;
  await db.insert(enrichmentResults).values(rows);
}

export async function getEnrichmentResultsByContactId(
  contactId: number,
  scope: TenantQueryScope,
) {
  const db = await getDb();
  if (!db) return [];

  const conds = [eq(enrichmentResults.contactId, contactId)];
  if (scope.type === "tenant") {
    conds.push(eq(enrichmentResults.organizationId, scope.organizationId));
  }
  return db
    .select()
    .from(enrichmentResults)
    .where(and(...conds))
    .orderBy(desc(enrichmentResults.collectedAt), desc(enrichmentResults.id));
}

export async function createContact(data: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contacts).values(data);
  return result[0];
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

function normalizeOptionalLower(value: string | null | undefined): string | null {
  const v = normalizeOptionalText(value);
  return v ? v.toLowerCase() : null;
}

function normalizeDomainish(value: string | null | undefined): string | null {
  const v = normalizeOptionalText(value);
  if (!v) return null;
  const noProto = v.replace(/^https?:\/\//i, "");
  const hostOnly = noProto.split("/")[0] ?? noProto;
  return hostOnly.replace(/^www\./i, "").toLowerCase().trim() || null;
}

function nameTokenSet(fullName: string | null | undefined): Set<string> {
  const v = normalizeOptionalLower(fullName);
  if (!v) return new Set();
  return new Set(
    v
      .split(/\s+/g)
      .map(x => x.replace(/[^a-z0-9]/g, ""))
      .filter(x => x.length >= 2),
  );
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let c = 0;
  a.forEach((x) => {
    if (b.has(x)) c++;
  });
  return c;
}

function mergeTags(existing: string[] | null | undefined, incoming: string[] | null | undefined): string[] | null {
  const a = (existing ?? []).map(x => x.trim()).filter(Boolean);
  const b = (incoming ?? []).map(x => x.trim()).filter(Boolean);
  const merged = Array.from(new Set([...a, ...b]));
  return merged.length > 0 ? merged : null;
}

function chooseBetterText(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  const e = normalizeOptionalText(existing);
  const i = normalizeOptionalText(incoming);
  if (!e && !i) return null;
  if (!e) return i;
  if (!i) return e;
  if (i.length > e.length + 8) return i;
  return e;
}

function mergeContactFields(existing: typeof contacts.$inferSelect, incoming: InsertContact): Partial<InsertContact> {
  const out: Partial<InsertContact> = {};

  const directTextFields: Array<keyof InsertContact> = [
    "firstName",
    "lastName",
    "fullName",
    "email",
    "title",
    "company",
    "industry",
    "companySize",
    "companyWebsite",
    "linkedinUrl",
    "location",
    "notes",
    "source",
    "importBatchId",
  ];
  for (const field of directTextFields) {
    const merged = chooseBetterText(existing[field] as string | null | undefined, incoming[field] as string | null | undefined);
    if (merged != null && merged !== (existing[field] ?? null)) {
      (out as any)[field] = merged;
    }
  }

  const mergedTags = mergeTags(existing.tags ?? null, incoming.tags ?? null);
  if (mergedTags && JSON.stringify(mergedTags) !== JSON.stringify(existing.tags ?? null)) out.tags = mergedTags;

  const existingConfidence = existing.emailConfidence ?? null;
  const incomingConfidence = incoming.emailConfidence ?? null;
  if (incomingConfidence != null && (existingConfidence == null || incomingConfidence > existingConfidence)) {
    out.emailConfidence = incomingConfidence;
  }

  const existingStatus = existing.emailStatus ?? "unknown";
  const incomingStatus = incoming.emailStatus ?? "unknown";
  const statusRank: Record<string, number> = {
    unknown: 0,
    risky: 1,
    catch_all: 2,
    valid: 3,
    invalid: 3,
  };
  if ((statusRank[incomingStatus] ?? 0) > (statusRank[existingStatus] ?? 0)) {
    out.emailStatus = incomingStatus;
  }

  const stageRank: Record<string, number> = {
    new: 0,
    enriched: 1,
    in_sequence: 2,
    replied: 3,
    closed: 4,
    unsubscribed: 4,
  };
  const existingStage = existing.stage ?? "new";
  const incomingStage = incoming.stage ?? "new";
  if ((stageRank[incomingStage] ?? 0) > (stageRank[existingStage] ?? 0)) {
    out.stage = incomingStage as InsertContact["stage"];
  }

  return out;
}

/** Resolve whether an incoming row matches an existing contact (email, LinkedIn, or fuzzy rules). Exported for CSV import duplicate handling. */
export async function findDuplicateContact(input: InsertContact): Promise<typeof contacts.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const scopeCond =
    input.organizationId == null
      ? isNull(contacts.organizationId)
      : eq(contacts.organizationId, input.organizationId);

  const email = normalizeOptionalLower(input.email);
  if (email) {
    const byEmail = await db
      .select()
      .from(contacts)
      .where(and(scopeCond, isNotNull(contacts.email)))
      .orderBy(desc(contacts.updatedAt))
      .limit(300);
    const found = byEmail.find(row => normalizeOptionalLower(row.email) === email);
    if (found) return found;
  }

  const linkedin = normalizeDomainish(input.linkedinUrl);
  if (linkedin) {
    const rows = await db
      .select()
      .from(contacts)
      .where(and(scopeCond, isNotNull(contacts.linkedinUrl)))
      .orderBy(desc(contacts.updatedAt))
      .limit(300);
    const found = rows.find(r => normalizeDomainish(r.linkedinUrl) === linkedin);
    if (found) return found;
  }

  const incomingNameTokens = nameTokenSet(input.fullName);
  const incomingCompany = normalizeOptionalLower(input.company);
  const incomingTitle = normalizeOptionalLower(input.title);
  const incomingWebsite = normalizeDomainish(input.companyWebsite);
  if (incomingNameTokens.size === 0 && !incomingCompany && !incomingTitle && !incomingWebsite) return null;

  const candidates = await db
    .select()
    .from(contacts)
    .where(scopeCond)
    .orderBy(desc(contacts.updatedAt))
    .limit(500);

  let best: {
    row: typeof contacts.$inferSelect;
    score: number;
    nameOverlap: number;
    companyMatch: boolean;
    titleMatch: boolean;
    websiteMatch: boolean;
    locationMatch: boolean;
  } | null = null;
  for (const row of candidates) {
    let score = 0;
    const rowNameTokens = nameTokenSet(row.fullName);
    const nameOverlap = overlapCount(incomingNameTokens, rowNameTokens);
    if (nameOverlap >= 2) score += 3;
    else if (nameOverlap === 1) score += 1;

    const rowCompany = normalizeOptionalLower(row.company);
    const companyMatch = Boolean(incomingCompany && rowCompany && incomingCompany === rowCompany);
    if (companyMatch) score += 2;

    const rowTitle = normalizeOptionalLower(row.title);
    const titleMatch = Boolean(
      incomingTitle &&
      rowTitle &&
      (incomingTitle === rowTitle || incomingTitle.includes(rowTitle) || rowTitle.includes(incomingTitle)),
    );
    if (titleMatch) {
      score += 1;
    }

    const rowWebsite = normalizeDomainish(row.companyWebsite);
    const websiteMatch = Boolean(incomingWebsite && rowWebsite && incomingWebsite === rowWebsite);
    if (websiteMatch) score += 2;

    const incomingLocation = normalizeOptionalLower(input.location);
    const rowLocation = normalizeOptionalLower(row.location);
    const locationMatch = Boolean(incomingLocation && rowLocation && incomingLocation === rowLocation);
    if (locationMatch) score += 1;

    if (!best || score > best.score) {
      best = {
        row,
        score,
        nameOverlap,
        companyMatch,
        titleMatch,
        websiteMatch,
        locationMatch,
      };
    }
  }

  if (!best) return null;

  const layeredConfirmations =
    (best.nameOverlap >= 1 ? 1 : 0) +
    (best.companyMatch ? 1 : 0) +
    (best.titleMatch ? 1 : 0) +
    (best.websiteMatch ? 1 : 0) +
    (best.locationMatch ? 1 : 0);

  // Multi-layer fuzzy confirmation: require person+company alignment and
  // at least one additional corroborating signal before auto-merging.
  const fuzzyConfirmed =
    best.nameOverlap >= 1 &&
    best.companyMatch &&
    (best.websiteMatch || best.titleMatch || best.locationMatch) &&
    best.score >= 5 &&
    layeredConfirmations >= 3;

  if (fuzzyConfirmed) return best.row;
  return null;
}

export async function createOrMergeContact(input: InsertContact): Promise<{
  action: "created" | "merged";
  contact: typeof contacts.$inferSelect;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const duplicate = await findDuplicateContact(input);
  if (!duplicate) {
    const insertResult = await db.insert(contacts).values(input);
    const insertedId = Number((insertResult as any)?.insertId ?? 0);
    const inserted = insertedId
      ? await getContactById(insertedId, scopeForContactOrganizationId(input.organizationId))
      : null;
    return {
      action: "created",
      contact: (inserted ??
        ({
          ...input,
          id: insertedId || -1,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)),
    };
  }

  const patch = mergeContactFields(duplicate, input);
  if (Object.keys(patch).length > 0) {
    await db.update(contacts).set(patch).where(eq(contacts.id, duplicate.id));
  }
  const merged =
    (await getContactById(duplicate.id, scopeForContactOrganizationId(duplicate.organizationId))) ??
    duplicate;
  return { action: "merged", contact: merged };
}

export async function upsertContact(data: InsertContact) {
  return createOrMergeContact(data);
}

export async function updateContact(
  id: number,
  data: Partial<InsertContact>,
  scope: TenantQueryScope,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [eq(contacts.id, id)];
  if (scope.type === "tenant") {
    conds.push(eq(contacts.organizationId, scope.organizationId));
  }
  await db.update(contacts).set(data).where(and(...conds));
}

export async function deleteContacts(ids: number[], scope: TenantQueryScope) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [inArray(contacts.id, ids)];
  if (scope.type === "tenant") {
    conds.push(eq(contacts.organizationId, scope.organizationId));
  }
  await db.delete(contacts).where(and(...conds));
}

export async function bulkUpdateContactStage(
  ids: number[],
  stage: string,
  scope: TenantQueryScope,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [inArray(contacts.id, ids)];
  if (scope.type === "tenant") {
    conds.push(eq(contacts.organizationId, scope.organizationId));
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

export async function getImportBatches(scope: TenantQueryScope) {
  const db = await getDb();
  if (!db) return [];
  if (scope.type === "platform") {
    return db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(20);
  }
  return db
    .selectDistinct({
      id: importBatches.id,
      batchId: importBatches.batchId,
      filename: importBatches.filename,
      totalRows: importBatches.totalRows,
      importedRows: importBatches.importedRows,
      skippedRows: importBatches.skippedRows,
      status: importBatches.status,
      errorLog: importBatches.errorLog,
      createdAt: importBatches.createdAt,
    })
    .from(importBatches)
    .innerJoin(contacts, eq(contacts.importBatchId, importBatches.batchId))
    .where(eq(contacts.organizationId, scope.organizationId))
    .orderBy(desc(importBatches.createdAt))
    .limit(20);
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
export async function getCampaigns(scope: TenantQueryScope) {
  const db = await getDb();
  if (!db) return [];
  if (scope.type === "tenant") {
    return db
      .select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, scope.organizationId))
      .orderBy(desc(campaigns.createdAt));
  }
  return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

export async function getCampaignById(id: number, scope: TenantQueryScope) {
  const db = await getDb();
  if (!db) return undefined;
  const conds = [eq(campaigns.id, id)];
  if (scope.type === "tenant") {
    conds.push(eq(campaigns.organizationId, scope.organizationId));
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
  scope: TenantQueryScope,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [eq(campaigns.id, id)];
  if (scope.type === "tenant") {
    conds.push(eq(campaigns.organizationId, scope.organizationId));
  }
  await db.update(campaigns).set(data).where(and(...conds));
}

export async function deleteCampaign(id: number, scope: TenantQueryScope) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conds = [eq(campaigns.id, id)];
  if (scope.type === "tenant") {
    conds.push(eq(campaigns.organizationId, scope.organizationId));
  }
  await db.delete(campaigns).where(and(...conds));
}

// ─── Mailboxes ────────────────────────────────────────────────────────────────
export type MailboxWithState = typeof mailboxes.$inferSelect & {
  health: typeof mailboxHealth.$inferSelect | null;
  limits: typeof mailboxSendLimits.$inferSelect | null;
};

export async function listMailboxesByOrganization(organizationId: number): Promise<MailboxWithState[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      mailbox: mailboxes,
      health: mailboxHealth,
      limits: mailboxSendLimits,
    })
    .from(mailboxes)
    .leftJoin(mailboxHealth, eq(mailboxHealth.mailboxId, mailboxes.id))
    .leftJoin(mailboxSendLimits, eq(mailboxSendLimits.mailboxId, mailboxes.id))
    .where(eq(mailboxes.organizationId, organizationId))
    .orderBy(desc(mailboxes.isDefault), asc(mailboxes.email));
  return rows.map(r => ({ ...r.mailbox, health: r.health ?? null, limits: r.limits ?? null }));
}

export async function getDefaultMailboxByOrganization(organizationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.organizationId, organizationId), eq(mailboxes.isDefault, true)))
    .limit(1);
  return rows[0];
}

export async function getMailboxById(mailboxId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.id, mailboxId))
    .limit(1);
  return rows[0];
}

export async function findMailboxByOrganizationAndEmail(
  organizationId: number,
  provider: "google" | "microsoft" | "smtp",
  email: string,
) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.organizationId, organizationId),
        eq(mailboxes.provider, provider),
        eq(mailboxes.email, email.toLowerCase()),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function createMailbox(data: InsertMailbox): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(mailboxes).values(data);
  const directInsertId = Number(
    (result as any)?.insertId ??
      ((Array.isArray(result) ? (result as any)[0]?.insertId : undefined) ?? 0),
  );
  if (Number.isFinite(directInsertId) && directInsertId > 0) {
    return directInsertId;
  }

  // Some MySQL driver/env combinations do not expose insertId reliably through Drizzle.
  // Resolve by querying the row we just inserted (org+provider+email is unique in current schema).
  const fallback = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.organizationId, data.organizationId),
        eq(mailboxes.provider, data.provider),
        eq(mailboxes.email, String(data.email ?? "").toLowerCase()),
      ),
    )
    .orderBy(desc(mailboxes.id))
    .limit(1);
  const fallbackId = Number(fallback[0]?.id ?? 0);
  if (Number.isFinite(fallbackId) && fallbackId > 0) {
    return fallbackId;
  }

  throw new Error("Mailbox insert succeeded but mailbox id could not be resolved");
}

export async function updateMailbox(
  mailboxId: number,
  data: Partial<InsertMailbox>,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(mailboxes).set(data).where(eq(mailboxes.id, mailboxId));
}

export async function upsertMailboxOauthToken(
  mailboxId: number,
  data: Omit<InsertMailboxOauthToken, "mailboxId">,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select({ id: mailboxOauthTokens.id })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.mailboxId, mailboxId))
    .limit(1);

  if (existing[0]?.id) {
    await db
      .update(mailboxOauthTokens)
      .set(data)
      .where(eq(mailboxOauthTokens.mailboxId, mailboxId));
    return;
  }

  await db.insert(mailboxOauthTokens).values({ mailboxId, ...data });
}

export async function getMailboxOauthToken(mailboxId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.mailboxId, mailboxId))
    .limit(1);
  return rows[0];
}

export async function createMailboxOauthConnectAttempt(
  data: InsertMailboxOauthConnectAttempt,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(mailboxOauthConnectAttempts).values(data);
}

export async function getMailboxOauthConnectAttemptByState(state: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(mailboxOauthConnectAttempts)
    .where(eq(mailboxOauthConnectAttempts.state, state))
    .limit(1);
  return rows[0];
}

export async function getMailboxOauthConnectAttemptByAttemptId(attemptId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(mailboxOauthConnectAttempts)
    .where(eq(mailboxOauthConnectAttempts.attemptId, attemptId))
    .limit(1);
  return rows[0];
}

export async function updateMailboxOauthConnectAttempt(
  attemptId: string,
  data: Partial<InsertMailboxOauthConnectAttempt>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(mailboxOauthConnectAttempts)
    .set(data)
    .where(eq(mailboxOauthConnectAttempts.attemptId, attemptId));
}

export async function upsertMailboxHealth(
  mailboxId: number,
  data: Partial<typeof mailboxHealth.$inferInsert>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: mailboxHealth.id })
    .from(mailboxHealth)
    .where(eq(mailboxHealth.mailboxId, mailboxId))
    .limit(1);
  if (existing[0]?.id) {
    await db.update(mailboxHealth).set(data).where(eq(mailboxHealth.mailboxId, mailboxId));
    return;
  }
  await db.insert(mailboxHealth).values({ mailboxId, ...data });
}

export async function upsertMailboxSendLimits(
  mailboxId: number,
  data: Partial<typeof mailboxSendLimits.$inferInsert>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: mailboxSendLimits.id })
    .from(mailboxSendLimits)
    .where(eq(mailboxSendLimits.mailboxId, mailboxId))
    .limit(1);
  if (existing[0]?.id) {
    await db.update(mailboxSendLimits).set(data).where(eq(mailboxSendLimits.mailboxId, mailboxId));
    return;
  }
  await db.insert(mailboxSendLimits).values({ mailboxId, ...data });
}

export async function setDefaultMailboxForOrganization(
  organizationId: number,
  mailboxId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(mailboxes)
    .set({ isDefault: false })
    .where(eq(mailboxes.organizationId, organizationId));
  await db
    .update(mailboxes)
    .set({ isDefault: true })
    .where(and(eq(mailboxes.organizationId, organizationId), eq(mailboxes.id, mailboxId)));
}

export async function upsertMailboxWebhookSubscription(input: {
  mailboxId: number;
  providerSubscriptionId: string;
  status?: "active" | "expired" | "error";
  expiresAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: mailboxWebhookSubscriptions.id })
    .from(mailboxWebhookSubscriptions)
    .where(
      and(
        eq(mailboxWebhookSubscriptions.mailboxId, input.mailboxId),
        eq(mailboxWebhookSubscriptions.providerSubscriptionId, input.providerSubscriptionId),
      ),
    )
    .limit(1);
  if (existing[0]?.id) {
    await db
      .update(mailboxWebhookSubscriptions)
      .set({
        status: input.status ?? "active",
        expiresAt: input.expiresAt ?? null,
      })
      .where(eq(mailboxWebhookSubscriptions.id, existing[0].id));
    return;
  }
  await db.insert(mailboxWebhookSubscriptions).values({
    mailboxId: input.mailboxId,
    providerSubscriptionId: input.providerSubscriptionId,
    status: input.status ?? "active",
    expiresAt: input.expiresAt ?? null,
  });
}

export async function getMailboxIdByProviderSubscriptionId(subscriptionId: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db
    .select({ mailboxId: mailboxWebhookSubscriptions.mailboxId })
    .from(mailboxWebhookSubscriptions)
    .where(eq(mailboxWebhookSubscriptions.providerSubscriptionId, subscriptionId))
    .limit(1);
  return row[0]?.mailboxId ?? null;
}

export async function listMicrosoftWebhookSubscriptionsDueForRenewal(withinHours: number) {
  const db = await getDb();
  if (!db) return [];
  const threshold = new Date(Date.now() + withinHours * 60 * 60 * 1000);
  return db
    .select()
    .from(mailboxWebhookSubscriptions)
    .where(
      and(
        eq(mailboxWebhookSubscriptions.status, "active"),
        isNotNull(mailboxWebhookSubscriptions.expiresAt),
        lte(mailboxWebhookSubscriptions.expiresAt, threshold),
      ),
    );
}

export async function deleteAllGraphSubscriptionsForMailbox(mailboxId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(mailboxWebhookSubscriptions).where(eq(mailboxWebhookSubscriptions.mailboxId, mailboxId));
}

export async function removeMailbox(mailboxId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(campaigns)
    .set({ mailboxId: null })
    .where(eq(campaigns.mailboxId, mailboxId));
  await db.delete(mailboxes).where(eq(mailboxes.id, mailboxId));
}

export async function getMailboxHealthByMailboxId(mailboxId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(mailboxHealth)
    .where(eq(mailboxHealth.mailboxId, mailboxId))
    .limit(1);
  return rows[0];
}

export async function getMailboxSendLimitsByMailboxId(mailboxId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(mailboxSendLimits)
    .where(eq(mailboxSendLimits.mailboxId, mailboxId))
    .limit(1);
  return rows[0];
}

export async function countMailboxEmailsSentSince(mailboxId: number, since: Date): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.mailboxId, mailboxId),
        eq(emailLogs.status, "sent"),
        gt(emailLogs.sentAt, since),
      ),
    );
  return Number(row?.n ?? 0);
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

  for (const v of values) {
    // Unique (campaignId, contactId): re-enroll must not create a second row or reset active/paused progress
    await db.insert(campaignContacts).values(v).onDuplicateKeyUpdate({ set: { id: sql`id` } });
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
  status: "enrolled" | "active" | "completed" | "unsubscribed" | "bounced" | "replied" | "positive_reply";
  currentStep: number;
  nextSendAt: Date | null;
  completedAt: Date | null;
  completionReason: string | null;
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

export async function getEmailLogById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(emailLogs).where(eq(emailLogs.id, id)).limit(1);
  return result[0];
}

export async function getEmailLogByIdempotencyKey(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(emailLogs)
    .where(eq(emailLogs.idempotencyKey, key))
    .limit(1);
  return result[0];
}

export type OrgOutreachStats = {
  totalSent: number;
  /** One row per email with at least one open. */
  uniqueOpens: number;
  /** One row per email with a processed inbound reply. */
  uniqueReplies: number;
  uniqueOpensByProvider: { provider: string; count: number }[];
};

export async function getOutreachStatsForOrganization(organizationId: number): Promise<OrgOutreachStats | null> {
  const db = await getDb();
  if (!db) return null;
  const [sentRow] = await db
    .select({ n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(eq(campaigns.organizationId, organizationId), eq(emailLogs.status, "sent")),
    );
  const [openRow] = await db
    .select({ n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(eq(campaigns.organizationId, organizationId), isNotNull(emailLogs.openedAt)),
    );
  const [replyRow] = await db
    .select({ n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(eq(campaigns.organizationId, organizationId), isNotNull(emailLogs.repliedAt)),
    );
  const openByProv = await db
    .select({
      p: mailboxes.provider,
      n: count(),
    })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .innerJoin(mailboxes, eq(emailLogs.mailboxId, mailboxes.id))
    .where(
      and(eq(campaigns.organizationId, organizationId), isNotNull(emailLogs.openedAt)),
    )
    .groupBy(mailboxes.provider);

  return {
    totalSent: Number(sentRow?.n ?? 0),
    uniqueOpens: Number(openRow?.n ?? 0),
    uniqueReplies: Number(replyRow?.n ?? 0),
    uniqueOpensByProvider: openByProv.map(r => ({ provider: r.p, count: Number(r.n) })),
  };
}

export type DashboardOverviewRangeDays = 7 | 30 | 90;

export type DashboardOverview = {
  rangeDays: DashboardOverviewRangeDays;
  timeseries: {
    day: string; // YYYY-MM-DD
    sent: number;
    uniqueOpens: number;
    uniqueReplies: number;
    bounces: number;
    unsubscribes: number;
  }[];
  funnel: {
    sent: number;
    opened: number;
    replied: number;
    positive: number;
    rates: {
      openRate: number;
      replyRate: number;
      positiveRate: number;
      positiveOfRepliesRate: number;
      bounceRate: number;
    };
  };
  deliverability: {
    sent: number;
    bounces: number;
    bounceRate: number;
    unsubscribes: number;
    opensByProvider: { provider: string; count: number }[];
    bouncesByProvider: { provider: string; count: number }[];
    unsubscribesByProvider: { provider: string; count: number }[];
  };
  pipelineStages: { stage: string; count: number }[];
  topCampaigns: {
    id: number;
    name: string;
    sent: number;
    openRate: number;
    replyRate: number;
    bounceRate: number;
  }[];
  worstCampaigns: {
    id: number;
    name: string;
    sent: number;
    openRate: number;
    replyRate: number;
    bounceRate: number;
  }[];
};

function toDbTimestampString(d: Date) {
  // Use sql`` with a string for TiDB/MySQL timestamp comparisons in this repo.
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function fmtDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function clampRangeDays(input: DashboardOverviewRangeDays) {
  if (input === 7 || input === 30 || input === 90) return input;
  return 7;
}

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

export async function getDashboardOverview(
  organizationId: number,
  rangeDays: DashboardOverviewRangeDays,
): Promise<DashboardOverview> {
  const db = await getDb();
  if (!db) {
    return {
      rangeDays: clampRangeDays(rangeDays),
      timeseries: [],
      funnel: {
        sent: 0,
        opened: 0,
        replied: 0,
        positive: 0,
        rates: { openRate: 0, replyRate: 0, positiveRate: 0, positiveOfRepliesRate: 0, bounceRate: 0 },
      },
      deliverability: {
        sent: 0,
        bounces: 0,
        bounceRate: 0,
        unsubscribes: 0,
        opensByProvider: [],
        bouncesByProvider: [],
        unsubscribesByProvider: [],
      },
      pipelineStages: [],
      topCampaigns: [],
      worstCampaigns: [],
    };
  }

  const effectiveRangeDays = clampRangeDays(rangeDays);
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - effectiveRangeDays + 1);
  start.setHours(0, 0, 0, 0);
  const startStr = toDbTimestampString(start);

  const dayKeys: string[] = [];
  for (let i = 0; i < effectiveRangeDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dayKeys.push(fmtDay(d));
  }
  const base = new Map(dayKeys.map(day => [day, { day, sent: 0, uniqueOpens: 0, uniqueReplies: 0, bounces: 0, unsubscribes: 0 }]));

  const sentByDay = await db
    .select({
      day: sql<string>`date(${emailLogs.sentAt})`,
      n: count(),
    })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        eq(emailLogs.status, "sent"),
        isNotNull(emailLogs.sentAt),
        sql`${emailLogs.sentAt} >= ${startStr}`,
      ),
    )
    .groupBy(sql`date(${emailLogs.sentAt})`);

  for (const r of sentByDay) {
    const day = String(r.day);
    const row = base.get(day);
    if (row) row.sent = Number(r.n ?? 0);
  }

  const opensByDay = await db
    .select({
      day: sql<string>`date(${emailLogs.openedAt})`,
      n: count(),
    })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        isNotNull(emailLogs.openedAt),
        sql`${emailLogs.openedAt} >= ${startStr}`,
      ),
    )
    .groupBy(sql`date(${emailLogs.openedAt})`);

  for (const r of opensByDay) {
    const day = String(r.day);
    const row = base.get(day);
    if (row) row.uniqueOpens = Number(r.n ?? 0);
  }

  const repliesByDay = await db
    .select({
      day: sql<string>`date(${emailLogs.repliedAt})`,
      n: count(),
    })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        isNotNull(emailLogs.repliedAt),
        sql`${emailLogs.repliedAt} >= ${startStr}`,
      ),
    )
    .groupBy(sql`date(${emailLogs.repliedAt})`);

  for (const r of repliesByDay) {
    const day = String(r.day);
    const row = base.get(day);
    if (row) row.uniqueReplies = Number(r.n ?? 0);
  }

  const bouncesByDay = await db
    .select({
      day: sql<string>`date(coalesce(${emailLogs.bouncedAt}, ${emailLogs.createdAt}))`,
      n: count(),
    })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        eq(emailLogs.status, "bounced"),
        sql`coalesce(${emailLogs.bouncedAt}, ${emailLogs.createdAt}) >= ${startStr}`,
      ),
    )
    .groupBy(sql`date(coalesce(${emailLogs.bouncedAt}, ${emailLogs.createdAt}))`);

  for (const r of bouncesByDay) {
    const day = String(r.day);
    const row = base.get(day);
    if (row) row.bounces = Number(r.n ?? 0);
  }

  const unsubByDay = await db
    .select({
      day: sql<string>`date(${mailboxUnsubscribes.createdAt})`,
      n: count(),
    })
    .from(mailboxUnsubscribes)
    .innerJoin(mailboxes, eq(mailboxUnsubscribes.mailboxId, mailboxes.id))
    .where(
      and(
        eq(mailboxes.organizationId, organizationId),
        sql`${mailboxUnsubscribes.createdAt} >= ${startStr}`,
      ),
    )
    .groupBy(sql`date(${mailboxUnsubscribes.createdAt})`);

  for (const r of unsubByDay) {
    const day = String(r.day);
    const row = base.get(day);
    if (row) row.unsubscribes = Number(r.n ?? 0);
  }

  const timeseries = dayKeys.map(k => base.get(k)!).filter(Boolean);

  const [sentRow] = await db
    .select({ n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        eq(emailLogs.status, "sent"),
        isNotNull(emailLogs.sentAt),
        sql`${emailLogs.sentAt} >= ${startStr}`,
      ),
    );

  const [openedRow] = await db
    .select({ n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        isNotNull(emailLogs.openedAt),
        sql`${emailLogs.openedAt} >= ${startStr}`,
      ),
    );

  const [repliedRow] = await db
    .select({ n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        isNotNull(emailLogs.repliedAt),
        sql`${emailLogs.repliedAt} >= ${startStr}`,
      ),
    );

  const [positiveRow] = await db
    .select({ n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        isNotNull(emailLogs.repliedAt),
        eq(emailLogs.replySentiment, "positive"),
        sql`${emailLogs.repliedAt} >= ${startStr}`,
      ),
    );

  const [bounceRow] = await db
    .select({ n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        eq(emailLogs.status, "bounced"),
        sql`coalesce(${emailLogs.bouncedAt}, ${emailLogs.createdAt}) >= ${startStr}`,
      ),
    );

  const totalSent = Number(sentRow?.n ?? 0);
  const totalOpened = Number(openedRow?.n ?? 0);
  const totalReplied = Number(repliedRow?.n ?? 0);
  const totalPositive = Number(positiveRow?.n ?? 0);
  const totalBounced = Number(bounceRow?.n ?? 0);

  const [unsubRow] = await db
    .select({ n: count() })
    .from(mailboxUnsubscribes)
    .innerJoin(mailboxes, eq(mailboxUnsubscribes.mailboxId, mailboxes.id))
    .where(
      and(
        eq(mailboxes.organizationId, organizationId),
        sql`${mailboxUnsubscribes.createdAt} >= ${startStr}`,
      ),
    );

  const unsubscribes = Number(unsubRow?.n ?? 0);

  const opensByProvider = await db
    .select({ provider: mailboxes.provider, n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .innerJoin(mailboxes, eq(emailLogs.mailboxId, mailboxes.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        isNotNull(emailLogs.openedAt),
        sql`${emailLogs.openedAt} >= ${startStr}`,
      ),
    )
    .groupBy(mailboxes.provider);

  const bouncesByProvider = await db
    .select({ provider: mailboxes.provider, n: count() })
    .from(emailLogs)
    .innerJoin(campaigns, eq(emailLogs.campaignId, campaigns.id))
    .innerJoin(mailboxes, eq(emailLogs.mailboxId, mailboxes.id))
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        eq(emailLogs.status, "bounced"),
        sql`coalesce(${emailLogs.bouncedAt}, ${emailLogs.createdAt}) >= ${startStr}`,
      ),
    )
    .groupBy(mailboxes.provider);

  const unsubscribesByProvider = await db
    .select({ provider: mailboxes.provider, n: count() })
    .from(mailboxUnsubscribes)
    .innerJoin(mailboxes, eq(mailboxUnsubscribes.mailboxId, mailboxes.id))
    .where(
      and(
        eq(mailboxes.organizationId, organizationId),
        sql`${mailboxUnsubscribes.createdAt} >= ${startStr}`,
      ),
    )
    .groupBy(mailboxes.provider);

  const pipelineStagesRaw = await db
    .select({ stage: contacts.stage, n: count() })
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId))
    .groupBy(contacts.stage);

  const pipelineStages = pipelineStagesRaw.map(r => ({ stage: String(r.stage), count: Number(r.n ?? 0) }));

  const campaignRows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      sent: sql<number>`sum(case when ${emailLogs.status} = 'sent' and ${emailLogs.sentAt} is not null and ${emailLogs.sentAt} >= ${startStr} then 1 else 0 end)`,
      opened: sql<number>`sum(case when ${emailLogs.openedAt} is not null and ${emailLogs.openedAt} >= ${startStr} then 1 else 0 end)`,
      replied: sql<number>`sum(case when ${emailLogs.repliedAt} is not null and ${emailLogs.repliedAt} >= ${startStr} then 1 else 0 end)`,
      bounced: sql<number>`sum(case when ${emailLogs.status} = 'bounced' and coalesce(${emailLogs.bouncedAt}, ${emailLogs.createdAt}) >= ${startStr} then 1 else 0 end)`,
    })
    .from(campaigns)
    .leftJoin(emailLogs, eq(emailLogs.campaignId, campaigns.id))
    .where(eq(campaigns.organizationId, organizationId))
    .groupBy(campaigns.id);

  const campaignRates = campaignRows
    .map(r => {
      const sent = Number(r.sent ?? 0);
      const opened = Number(r.opened ?? 0);
      const replied = Number(r.replied ?? 0);
      const bounced = Number(r.bounced ?? 0);
      return {
        id: Number(r.id),
        name: String(r.name ?? ""),
        sent,
        openRate: sent ? Math.round((opened / sent) * 100) : 0,
        replyRate: sent ? Math.round((replied / sent) * 100) : 0,
        bounceRate: sent ? Math.round((bounced / sent) * 100) : 0,
      };
    })
    .filter(r => r.sent > 0);

  const topCampaigns = [...campaignRates]
    .sort((a, b) => (b.replyRate - a.replyRate) || (b.openRate - a.openRate) || (b.sent - a.sent))
    .slice(0, 5);

  const worstCampaigns = [...campaignRates]
    .sort((a, b) => (b.bounceRate - a.bounceRate) || (a.replyRate - b.replyRate) || (b.sent - a.sent))
    .slice(0, 5);

  return {
    rangeDays: effectiveRangeDays,
    timeseries,
    funnel: {
      sent: totalSent,
      opened: totalOpened,
      replied: totalReplied,
      positive: totalPositive,
      rates: {
        openRate: pct(totalOpened, totalSent),
        replyRate: pct(totalReplied, totalSent),
        positiveRate: pct(totalPositive, totalSent),
        positiveOfRepliesRate: pct(totalPositive, totalReplied),
        bounceRate: pct(totalBounced, totalSent),
      },
    },
    deliverability: {
      sent: totalSent,
      bounces: totalBounced,
      bounceRate: pct(totalBounced, totalSent),
      unsubscribes,
      opensByProvider: opensByProvider.map(r => ({ provider: String(r.provider), count: Number(r.n ?? 0) })),
      bouncesByProvider: bouncesByProvider.map(r => ({ provider: String(r.provider), count: Number(r.n ?? 0) })),
      unsubscribesByProvider: unsubscribesByProvider.map(r => ({ provider: String(r.provider), count: Number(r.n ?? 0) })),
    },
    pipelineStages,
    topCampaigns,
    worstCampaigns,
  };
}

export type UserDashboardPrefs = {
  rangeDays: DashboardOverviewRangeDays;
  sections: Record<string, boolean>;
  sectionOrder: string[];
  updatedAt: Date;
};

export async function getUserDashboardPrefs(userId: number): Promise<UserDashboardPrefs | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(userDashboardPreferences)
    .where(eq(userDashboardPreferences.userId, userId))
    .limit(1);
  if (!row) return null;
  const rangeDaysRaw = Number(row.rangeDays ?? 7);
  const rangeDays: DashboardOverviewRangeDays =
    rangeDaysRaw === 7 || rangeDaysRaw === 30 || rangeDaysRaw === 90 ? rangeDaysRaw : 7;
  return {
    rangeDays,
    sections: (row.sectionsJson ?? {}) as Record<string, boolean>,
    sectionOrder: (row.sectionOrderJson ?? []) as string[],
    updatedAt: row.updatedAt,
  };
}

export async function upsertUserDashboardPrefs(input: {
  userId: number;
  rangeDays: DashboardOverviewRangeDays;
  sections: Record<string, boolean>;
  sectionOrder: string[];
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(userDashboardPreferences)
    .values({
      userId: input.userId,
      rangeDays: input.rangeDays,
      sectionsJson: input.sections,
      sectionOrderJson: input.sectionOrder,
    })
    .onDuplicateKeyUpdate({
      set: {
        rangeDays: input.rangeDays,
        sectionsJson: input.sections,
        sectionOrderJson: input.sectionOrder,
      },
    });
}

export async function listSuppressionsForMailbox(mailboxId: number, organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  const mb = await getMailboxById(mailboxId);
  if (!mb || mb.organizationId !== organizationId) return [];
  return db
    .select()
    .from(mailboxUnsubscribes)
    .where(eq(mailboxUnsubscribes.mailboxId, mailboxId))
    .orderBy(desc(mailboxUnsubscribes.createdAt));
}

export async function removeSuppressionById(id: number, organizationId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const row = await db
    .select({ mailboxId: mailboxUnsubscribes.mailboxId })
    .from(mailboxUnsubscribes)
    .where(eq(mailboxUnsubscribes.id, id))
    .limit(1);
  if (!row[0]) return false;
  const mb = await getMailboxById(row[0].mailboxId);
  if (!mb || mb.organizationId !== organizationId) return false;
  await db.delete(mailboxUnsubscribes).where(eq(mailboxUnsubscribes.id, id));
  return true;
}

export function formatSuppressionsCsv(rows: { recipientEmail: string; source: string; createdAt: Date | null }[]) {
  const header = "email,source,createdAt";
  const lines = rows.map(r => {
    const email = (r.recipientEmail ?? "").replaceAll('"', '""');
    const created = r.createdAt ? r.createdAt.toISOString() : "";
    return `"${email}",${r.source},${created}`;
  });
  return [header, ...lines].join("\n");
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
  scope: TenantQueryScope,
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
  if (scope.type === "tenant" && campaignOrgId !== scope.organizationId) {
    agentDebugLog({
      runId: "post-fix",
      hypothesisId: "H_TENANT_MARK_REPLIED",
      location: "server/db.ts:markEmailReplied-scope-check",
      message: "Blocked markReplied due to org scope mismatch",
      data: { scopeOrganizationId: scope.type === "tenant" ? scope.organizationId : null, campaignOrgId, emailLogId },
    });
    throw new TRPCError({ code: "NOT_FOUND", message: "Email log not found" });
  }

  const { ingestEmailReply } = await import("./services/replyIngestion");
  await ingestEmailReply(emailLogId, { forceSentiment: "unknown" });
}

export async function getEmailLogByProviderMessageId(providerMessageId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(emailLogs)
    .where(eq(emailLogs.providerMessageId, providerMessageId))
    .limit(1);
  return rows[0];
}

export async function applyProviderTrackingEvent(input: {
  providerMessageId: string;
  eventType: "open" | "reply" | "bounce";
  /** When the provider id is an inbound Graph message id, set to load body and match `email_logs`. */
  mailboxId?: number;
}) {
  const db = await getDb();
  if (!db) return false;
  let log = await getEmailLogByProviderMessageId(input.providerMessageId);
  let replyTextSnippet: string | null = null;

  if (input.eventType === "reply" && input.mailboxId) {
    const mb = await getMailboxById(input.mailboxId);
    if (mb?.provider === "microsoft") {
      const { resolveMicrosoftReplyTargetLog } = await import("./services/inboundMessageFetch");
      const resolved = await resolveMicrosoftReplyTargetLog(input.mailboxId, input.providerMessageId);
      if (resolved) {
        const next = await getEmailLogById(resolved.logId);
        if (next) {
          log = next;
          replyTextSnippet = resolved.textSnippet;
        }
      }
    }
  }

  if (!log) return false;

  if (log.trackingId) {
    await db.insert(trackingEvents).values({
      trackingId: log.trackingId,
      eventType: input.eventType,
      ipAddress: null,
      userAgent: `provider:${input.providerMessageId}`,
    });
  }

  if (input.eventType === "open") {
    await db
      .update(emailLogs)
      .set({
        openedAt: log.openedAt ?? new Date(),
        openCount: (log.openCount ?? 0) + 1,
      })
      .where(eq(emailLogs.id, log.id));
    if (!log.openedAt) {
      await db
        .update(campaigns)
        .set({ openCount: sql`${campaigns.openCount} + 1` })
        .where(eq(campaigns.id, log.campaignId));
    }
    return true;
  }

  if (input.eventType === "reply") {
    const { ingestEmailReply } = await import("./services/replyIngestion");
    await ingestEmailReply(log.id, { textSnippet: replyTextSnippet ?? "" });
    return true;
  }

  await db
    .update(emailLogs)
    .set({ status: "bounced", bouncedAt: log.bouncedAt ?? new Date() })
    .where(eq(emailLogs.id, log.id));
  if (!log.bouncedAt) {
    await db
      .update(campaigns)
      .set({ bounceCount: sql`${campaigns.bounceCount} + 1` })
      .where(eq(campaigns.id, log.campaignId));
    if (log.campaignContactId) {
      await db
        .update(campaignContacts)
        .set({ status: "bounced" })
        .where(eq(campaignContacts.id, log.campaignContactId));
    }
  }
  return true;
}

export async function getCampaignStats(campaignId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  return result[0];
}

function normalizeListEmail(e: string): string {
  return e.trim().toLowerCase();
}

export async function recordMailboxUnsubscribe(
  mailboxId: number,
  recipientEmail: string,
  source: "link_click" | "reply_detected" | "api" = "link_click",
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const email = normalizeListEmail(recipientEmail);
  await db
    .insert(mailboxUnsubscribes)
    .values({ mailboxId, recipientEmail: email, source })
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });
}

export async function isRecipientUnsubscribedFromMailbox(
  mailboxId: number,
  recipientEmail: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const email = normalizeListEmail(recipientEmail);
  const rows = await db
    .select({ id: mailboxUnsubscribes.id })
    .from(mailboxUnsubscribes)
    .where(
      and(eq(mailboxUnsubscribes.mailboxId, mailboxId), eq(mailboxUnsubscribes.recipientEmail, email)),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function deactivateEnrollmentsForMailboxContact(mailboxId: number, contactId: number) {
  const db = await getDb();
  if (!db) return;
  const campRows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.mailboxId, mailboxId));
  const campIds = campRows.map(r => r.id);
  if (!campIds.length) return;
  await db
    .update(campaignContacts)
    .set({ status: "unsubscribed", nextSendAt: null, completionReason: "mailbox_unsubscribe" })
    .where(
      and(inArray(campaignContacts.campaignId, campIds), eq(campaignContacts.contactId, contactId)),
    );
}

export async function deactivateEnrollmentsForMailboxEmail(mailboxId: number, recipientEmail: string) {
  const db = await getDb();
  if (!db) return;
  const email = recipientEmail.trim().toLowerCase();
  if (!email) return;
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.email, email));
  const ids = rows.map(r => r.id);
  if (!ids.length) return;
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await deactivateEnrollmentsForMailboxContact(mailboxId, id);
  }
}

export async function completeUnsubscribeByMailboxAndContact(
  mailboxId: number,
  contactId: number,
  email: string,
  source: "link_click" | "reply_detected" | "api",
) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  const contact = rows[0];
  if (!contact) return false;
  const e1 = normalizeListEmail(email);
  const e2 = contact.email ? normalizeListEmail(contact.email) : "";
  if (e2 && e1 && e1 !== e2) return false;
  const toStore = e1 || e2;
  if (!toStore) return false;
  await recordMailboxUnsubscribe(mailboxId, toStore, source);
  await deactivateEnrollmentsForMailboxContact(mailboxId, contactId);
  return true;
}

export async function unsubscribeByTrackingId(trackingId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const log = await getEmailLogByTrackingId(trackingId);
  if (!log) return false;

  if (log.toEmail && log.mailboxId) {
    await recordMailboxUnsubscribe(log.mailboxId, log.toEmail, "link_click");
    await deactivateEnrollmentsForMailboxContact(log.mailboxId, log.contactId);
  }

  if (log.campaignContactId) {
    await db
      .update(campaignContacts)
      .set({ status: "unsubscribed", nextSendAt: null, completionReason: "unsubscribe_link" })
      .where(eq(campaignContacts.id, log.campaignContactId));
  }

  if (log.trackingId) {
    await db.insert(trackingEvents).values({ trackingId, eventType: "click" });
  }

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
