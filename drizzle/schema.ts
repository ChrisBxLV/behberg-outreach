import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  double,
  float,
  json,
  bigint,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── Organizations (multi-tenant workspace) ───────────────────────────────────
export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  /** Billing / plan id (mirrors Settings subscription tab). Superadmin can change instance-wide. */
  subscriptionPlanId: varchar("subscriptionPlanId", { length: 64 }).default("free").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  country: varchar("country", { length: 2 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // Password login (PBKDF2 derived hash). Nullable to support existing OAuth-only users.
  passwordSalt: varchar("passwordSalt", { length: 128 }),
  passwordHash: varchar("passwordHash", { length: 128 }),
  /** `superadmin` = Behberg platform operator (all tenants). `admin` = workspace admin. */
  role: mysqlEnum("role", ["user", "admin", "superadmin"]).default("user").notNull(),
  /** When true, sign-in and platform access are denied (set from Superadmin console). */
  accountDisabled: boolean("accountDisabled").default(false).notNull(),
  /**
   * Workspace this user belongs to (null = platform / legacy users).
   * Nullable by design; non-null values are enforced by FK `users_organization_id_fk` (migration 0006).
   */
  organizationId: int("organizationId").references(() => organizations.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  /** owner = org admin who signed up; member = invited by owner. */
  orgMemberRole: mysqlEnum("orgMemberRole", ["owner", "member"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** Dismissal cursor for "new positive replies" on dashboard. */
  positiveRepliesLastSeenAt: timestamp("positiveRepliesLastSeenAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const loginChallenges = mysqlTable("login_challenges", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  codeHash: varchar("codeHash", { length: 128 }).notNull(),
  requestIp: varchar("requestIp", { length: 64 }),
  expiresAt: timestamp("expiresAt").notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  maxAttempts: int("maxAttempts").default(5).notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LoginChallenge = typeof loginChallenges.$inferSelect;
export type InsertLoginChallenge = typeof loginChallenges.$inferInsert;

// ─── User Dashboard Preferences (per-user, cross-device) ───────────────────────
export const userDashboardPreferences = mysqlTable("user_dashboard_preferences", {
  userId: int("userId").notNull().primaryKey().references(() => users.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  sectionsJson: json("sectionsJson").$type<Record<string, boolean> | null>(),
  sectionOrderJson: json("sectionOrderJson").$type<string[] | null>(),
  rangeDays: int("rangeDays"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserDashboardPreferences = typeof userDashboardPreferences.$inferSelect;
export type InsertUserDashboardPreferences = typeof userDashboardPreferences.$inferInsert;

// ─── Contacts ─────────────────────────────────────────────────────────────────
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  // Identity
  firstName: varchar("firstName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }),
  fullName: varchar("fullName", { length: 256 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  emailConfidence: float("emailConfidence"), // 0-1 from Apollo
  emailStatus: mysqlEnum("emailStatus", ["unknown", "valid", "invalid", "catch_all", "risky"]).default("unknown"),
  // Professional
  title: varchar("title", { length: 256 }),
  company: varchar("company", { length: 256 }),
  industry: varchar("industry", { length: 256 }),
  companySize: varchar("companySize", { length: 64 }),
  companyWebsite: varchar("companyWebsite", { length: 512 }),
  linkedinUrl: varchar("linkedinUrl", { length: 512 }),
  /** Normalized domain derived from email or companyWebsite (non-personal domains only). */
  normalizedDomain: varchar("normalizedDomain", { length: 255 }),
  enrichmentStatus: varchar("enrichmentStatus", { length: 32 }).default("not_enriched").notNull(),
  enrichmentUpdatedAt: timestamp("enrichmentUpdatedAt"),
  location: varchar("location", { length: 256 }),
  // Pipeline
  stage: mysqlEnum("stage", ["new", "enriched", "in_sequence", "replied", "closed", "unsubscribed"]).default("new").notNull(),
  notes: text("notes"),
  tags: json("tags").$type<string[]>(),
  // Source
  source: varchar("source", { length: 64 }).default("csv_import"),
  importBatchId: varchar("importBatchId", { length: 64 }),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  /**
   * Row-level scope: same id as organizations.id; null = legacy unscoped rows.
   * Nullable by design; non-null values are enforced by FK `contacts_organization_id_fk` (migration 0006).
   */
  organizationId: int("organizationId").references(() => organizations.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ─── Enrichment Results (contact-level) ───────────────────────────────────────
export const enrichmentResults = mysqlTable("enrichment_results", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
  contactId: int("contactId")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade", onUpdate: "cascade" }),
  source: varchar("source", { length: 64 }).notNull(),
  fieldName: varchar("fieldName", { length: 128 }).notNull(),
  fieldValue: text("fieldValue").notNull(),
  confidence: int("confidence").default(0).notNull(),
  personalData: boolean("personalData").default(false).notNull(),
  rawData: json("rawData").$type<unknown>(),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EnrichmentResult = typeof enrichmentResults.$inferSelect;
export type InsertEnrichmentResult = typeof enrichmentResults.$inferInsert;

// ─── Import Batches ───────────────────────────────────────────────────────────
export const importBatches = mysqlTable("import_batches", {
  id: int("id").autoincrement().primaryKey(),
  batchId: varchar("batchId", { length: 64 }).notNull().unique(),
  filename: varchar("filename", { length: 256 }),
  totalRows: int("totalRows").default(0),
  importedRows: int("importedRows").default(0),
  skippedRows: int("skippedRows").default(0),
  status: mysqlEnum("status", ["processing", "completed", "failed"]).default("processing"),
  errorLog: text("errorLog"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImportBatch = typeof importBatches.$inferSelect;

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["draft", "active", "paused", "completed"]).default("draft").notNull(),
  fromName: varchar("fromName", { length: 128 }).default("Behberg"),
  fromEmail: varchar("fromEmail", { length: 320 }).default("outreach@behberg.com"),
  replyTo: varchar("replyTo", { length: 320 }),
  mailboxId: int("mailboxId"),
  // Tracking
  totalContacts: int("totalContacts").default(0),
  sentCount: int("sentCount").default(0),
  openCount: int("openCount").default(0),
  replyCount: int("replyCount").default(0),
  bounceCount: int("bounceCount").default(0),
  // Milestone notifications
  notifiedAt100Sent: boolean("notifiedAt100Sent").default(false),
  notifiedHighReply: boolean("notifiedHighReply").default(false),
  notifiedBounce: boolean("notifiedBounce").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  /**
   * Nullable for legacy rows; non-null values are enforced by FK `campaigns_organization_id_fk` (migration 0006).
   */
  organizationId: int("organizationId").references(() => organizations.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// ─── Mailboxes ────────────────────────────────────────────────────────────────
export const mailboxes = mysqlTable(
  "mailboxes",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
    connectedByUserId: int("connectedByUserId").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    provider: mysqlEnum("provider", ["google", "microsoft", "smtp"]).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("displayName", { length: 200 }),
    status: mysqlEnum("status", ["connected", "reauth_required", "error", "disabled"])
      .default("connected")
      .notNull(),
    isDefault: boolean("isDefault").default(false).notNull(),
    /** Optional HTML or plain line breaks; appended to outbound messages from this mailbox. */
    signatureHtml: text("signatureHtml"),
    signatureLogoUrl: varchar("signatureLogoUrl", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    orgProviderEmailUnique: uniqueIndex("mailboxes_org_provider_email_unique").on(
      table.organizationId,
      table.provider,
      table.email,
    ),
  }),
);

export type Mailbox = typeof mailboxes.$inferSelect;
export type InsertMailbox = typeof mailboxes.$inferInsert;

export const mailboxUnsubscribes = mysqlTable(
  "mailbox_unsubscribes",
  {
    id: int("id").autoincrement().primaryKey(),
    mailboxId: int("mailboxId")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade", onUpdate: "cascade" }),
    recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
    source: mysqlEnum("source", ["link_click", "reply_detected", "api"])
      .default("link_click")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    mailboxEmailUnique: uniqueIndex("mailbox_unsubscribes_mailbox_email_unique").on(
      table.mailboxId,
      table.recipientEmail,
    ),
  }),
);

export type MailboxUnsubscribe = typeof mailboxUnsubscribes.$inferSelect;

export const mailboxOauthTokens = mysqlTable("mailbox_oauth_tokens", {
  id: int("id").autoincrement().primaryKey(),
  mailboxId: int("mailboxId")
    .notNull()
    .references(() => mailboxes.id, { onDelete: "cascade", onUpdate: "cascade" }),
  encryptedAccessToken: text("encryptedAccessToken"),
  encryptedRefreshToken: text("encryptedRefreshToken"),
  encryptedSmtpPassword: text("encryptedSmtpPassword"),
  smtpHost: varchar("smtpHost", { length: 256 }),
  smtpPort: int("smtpPort"),
  smtpSecure: boolean("smtpSecure").default(false).notNull(),
  smtpUsername: varchar("smtpUsername", { length: 320 }),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  scopes: text("scopes"),
  providerAccountId: varchar("providerAccountId", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MailboxOauthToken = typeof mailboxOauthTokens.$inferSelect;
export type InsertMailboxOauthToken = typeof mailboxOauthTokens.$inferInsert;

export const mailboxOauthConnectAttempts = mysqlTable("mailbox_oauth_connect_attempts", {
  id: int("id").autoincrement().primaryKey(),
  attemptId: varchar("attemptId", { length: 64 }).notNull().unique(),
  state: varchar("state", { length: 128 }).notNull().unique(),
  provider: mysqlEnum("provider", ["google", "microsoft"]).notNull(),
  organizationId: int("organizationId")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  status: mysqlEnum("status", ["pending", "processing", "succeeded", "failed", "cancelled"])
    .default("pending")
    .notNull(),
  errorCode: varchar("errorCode", { length: 128 }),
  errorMessage: text("errorMessage"),
  mailboxId: int("mailboxId").references(() => mailboxes.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MailboxOauthConnectAttempt = typeof mailboxOauthConnectAttempts.$inferSelect;
export type InsertMailboxOauthConnectAttempt = typeof mailboxOauthConnectAttempts.$inferInsert;

export const mailboxHealth = mysqlTable("mailbox_health", {
  id: int("id").autoincrement().primaryKey(),
  mailboxId: int("mailboxId")
    .notNull()
    .references(() => mailboxes.id, { onDelete: "cascade", onUpdate: "cascade" })
    .unique(),
  lastSuccessAt: timestamp("lastSuccessAt"),
  lastErrorAt: timestamp("lastErrorAt"),
  errorCode: varchar("errorCode", { length: 128 }),
  errorMessage: text("errorMessage"),
  reauthRequired: boolean("reauthRequired").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MailboxHealth = typeof mailboxHealth.$inferSelect;
export type InsertMailboxHealth = typeof mailboxHealth.$inferInsert;

export const mailboxSendLimits = mysqlTable("mailbox_send_limits", {
  id: int("id").autoincrement().primaryKey(),
  mailboxId: int("mailboxId")
    .notNull()
    .references(() => mailboxes.id, { onDelete: "cascade", onUpdate: "cascade" })
    .unique(),
  dailyLimit: int("dailyLimit").default(250).notNull(),
  hourlyLimit: int("hourlyLimit").default(40).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
  warmupProfile: json("warmupProfile").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MailboxSendLimit = typeof mailboxSendLimits.$inferSelect;
export type InsertMailboxSendLimit = typeof mailboxSendLimits.$inferInsert;

export const mailboxWebhookSubscriptions = mysqlTable("mailbox_webhook_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  mailboxId: int("mailboxId")
    .notNull()
    .references(() => mailboxes.id, { onDelete: "cascade", onUpdate: "cascade" }),
  providerSubscriptionId: varchar("providerSubscriptionId", { length: 256 }).notNull(),
  status: mysqlEnum("status", ["active", "expired", "error"]).default("active").notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MailboxWebhookSubscription = typeof mailboxWebhookSubscriptions.$inferSelect;
export type InsertMailboxWebhookSubscription = typeof mailboxWebhookSubscriptions.$inferInsert;

// ─── Sequence Steps ───────────────────────────────────────────────────────────
export const sequenceSteps = mysqlTable("sequence_steps", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  stepOrder: int("stepOrder").notNull(), // 1, 2, 3...
  stepType: mysqlEnum("stepType", ["initial", "follow_up", "last_notice", "opened_no_reply"]).notNull(),
  subject: varchar("subject", { length: 512 }).notNull(),
  bodyTemplate: text("bodyTemplate").notNull(), // Handlebars-style {{firstName}}, {{company}}
  delayDays: int("delayDays").default(0), // Days after previous step
  delayHours: int("delayHours").default(0),
  condition: mysqlEnum("condition", ["always", "not_opened", "opened_no_reply", "not_replied"]).default("always"),
  useLlmPersonalization: boolean("useLlmPersonalization").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type InsertSequenceStep = typeof sequenceSteps.$inferInsert;

// ─── Campaign Contacts (enrollment) ──────────────────────────────────────────
export const campaignContacts = mysqlTable(
  "campaign_contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    contactId: int("contactId").notNull(),
    status: mysqlEnum("status", [
      "enrolled",
      "active",
      "completed",
      "unsubscribed",
      "bounced",
      "replied",
      "positive_reply",
    ]).default("enrolled").notNull(),
    currentStep: int("currentStep").default(0),
    enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    nextSendAt: timestamp("nextSendAt"),
    /** e.g. negative_reply, completed_sequence */
    completionReason: varchar("completionReason", { length: 64 }),
  },
  table => ({
    campaignContactUnique: uniqueIndex("campaign_contacts_campaign_contact_unique").on(
      table.campaignId,
      table.contactId,
    ),
  }),
);

export type CampaignContact = typeof campaignContacts.$inferSelect;

// ─── Email Logs ───────────────────────────────────────────────────────────────
export const emailLogs = mysqlTable("email_logs", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  contactId: int("contactId").notNull(),
  sequenceStepId: int("sequenceStepId"),
  campaignContactId: int("campaignContactId"),
  mailboxId: int("mailboxId"),
  // Email content
  subject: varchar("subject", { length: 512 }),
  body: text("body"),
  fromEmail: varchar("fromEmail", { length: 320 }),
  toEmail: varchar("toEmail", { length: 320 }),
  // Status
  status: mysqlEnum("status", ["queued", "sent", "failed", "bounced"]).default("queued").notNull(),
  providerMessageId: varchar("providerMessageId", { length: 256 }),
  /** Dedupes sends on scheduler retries: `${campaignContactId}:${sequenceStepId}` */
  idempotencyKey: varchar("idempotencyKey", { length: 256 }).unique(),
  providerThreadId: varchar("providerThreadId", { length: 256 }),
  // Tracking
  trackingId: varchar("trackingId", { length: 64 }).unique(), // UUID for pixel tracking
  openedAt: timestamp("openedAt"),
  openCount: int("openCount").default(0),
  repliedAt: timestamp("repliedAt"),
  replySentiment: mysqlEnum("replySentiment", [
    "positive",
    "negative",
    "neutral",
    "unsubscribe_intent",
    "unknown",
  ]),
  replySnippet: text("replySnippet"),
  bouncedAt: timestamp("bouncedAt"),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt"),
  scheduledAt: timestamp("scheduledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;

// ─── Tracking Events ──────────────────────────────────────────────────────────
export const trackingEvents = mysqlTable("tracking_events", {
  id: int("id").autoincrement().primaryKey(),
  trackingId: varchar("trackingId", { length: 64 }).notNull(),
  eventType: mysqlEnum("eventType", ["open", "click", "bounce", "reply"]).notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Signals ──────────────────────────────────────────────────────────────────
export const signalProfiles = mysqlTable("signal_profiles", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" })
    .unique(),
  businessType: varchar("businessType", { length: 64 }).notNull(),
  selectedTags: json("selectedTags").$type<string[]>().notNull(),
  selectedSignalTypes: json("selectedSignalTypes").$type<string[]>().notNull(),
  sourcesEnabled: json("sourcesEnabled").$type<string[]>().notNull(),
  refreshCadenceMinutes: int("refreshCadenceMinutes").default(30).notNull(),
  isEnabled: boolean("isEnabled").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SignalProfile = typeof signalProfiles.$inferSelect;
export type InsertSignalProfile = typeof signalProfiles.$inferInsert;

export const signals = mysqlTable("signals", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
  source: varchar("source", { length: 120 }).notNull(),
  externalId: varchar("externalId", { length: 512 }).notNull().unique(),
  signalType: varchar("signalType", { length: 64 }).notNull(),
  companyName: varchar("companyName", { length: 256 }).notNull(),
  headline: text("headline").notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  tags: json("tags").$type<string[]>().notNull(),
  occurredAt: timestamp("occurredAt").notNull(),
  ingestedAt: timestamp("ingestedAt").defaultNow().notNull(),
  rawPayload: json("rawPayload").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;

export const signalInsights = mysqlTable("signal_insights", {
  id: int("id").autoincrement().primaryKey(),
  signalId: int("signalId")
    .notNull()
    .references(() => signals.id, { onDelete: "cascade", onUpdate: "cascade" })
    .unique(),
  summaryShort: varchar("summaryShort", { length: 512 }).notNull(),
  actionSuggestion: text("actionSuggestion").notNull(),
  reasoning: text("reasoning"),
  relevanceScore: float("relevanceScore").default(0).notNull(),
  vertical: varchar("vertical", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SignalInsight = typeof signalInsights.$inferSelect;
export type InsertSignalInsight = typeof signalInsights.$inferInsert;

export const signalIngestionRuns = mysqlTable("signal_ingestion_runs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade", onUpdate: "cascade" }),
  source: varchar("source", { length: 120 }).notNull(),
  status: mysqlEnum("status", ["started", "completed", "failed"]).default("started").notNull(),
  fetchedCount: int("fetchedCount").default(0).notNull(),
  insertedCount: int("insertedCount").default(0).notNull(),
  summarizedCount: int("summarizedCount").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
});

export type SignalIngestionRun = typeof signalIngestionRuns.$inferSelect;
export type InsertSignalIngestionRun = typeof signalIngestionRuns.$inferInsert;

// ─── Prospect Database ────────────────────────────────────────────────────────
// Autonomous, organization-agnostic catalogue of companies + employees that
// grows in the background via deterministic crawlers. Independent of `contacts`
// (which remains the per-org CRM list).

export const industries = mysqlTable("industries", {
  code: varchar("code", { length: 64 }).primaryKey(),
  label: varchar("label", { length: 128 }).notNull(),
  parentCode: varchar("parentCode", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Industry = typeof industries.$inferSelect;
export type InsertIndustry = typeof industries.$inferInsert;

export const prospectCompanies = mysqlTable(
  "prospect_companies",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    /** Lowercased, punctuation-stripped name used for dedupe when domain is unknown. */
    nameNormalized: varchar("nameNormalized", { length: 256 }).notNull(),
    /** Root domain (lowercased, no www). Unique when set. */
    domain: varchar("domain", { length: 255 }),
    hqCountry: varchar("hqCountry", { length: 2 }),
    hqAdmin1: varchar("hqAdmin1", { length: 8 }),
    hqCity: varchar("hqCity", { length: 128 }),
    headcount: int("headcount"),
    /** "1-10","11-50","51-200","201-500","501-1k","1k-5k","5k-10k","10k+" */
    headcountBand: varchar("headcountBand", { length: 16 }),
    industryCode: varchar("industryCode", { length: 64 }),
    subIndustryCode: varchar("subIndustryCode", { length: 64 }),
    linkedinUrl: varchar("linkedinUrl", { length: 512 }),
    websiteVerified: boolean("websiteVerified").default(false).notNull(),
    source: varchar("source", { length: 32 }).default("unknown").notNull(),
    sourceEvidenceUrl: varchar("sourceEvidenceUrl", { length: 1024 }),
    /** "active","stale","blocked","excluded_self_employed" */
    status: varchar("status", { length: 32 }).default("active").notNull(),
    firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
    lastEnrichedAt: timestamp("lastEnrichedAt"),
    lastVerifiedAt: timestamp("lastVerifiedAt"),
  },
  table => ({
    domainUnique: uniqueIndex("prospect_companies_domain_unique").on(table.domain),
    linkedinUrlUnique: uniqueIndex("prospect_companies_linkedin_unique").on(table.linkedinUrl),
  }),
);

export type ProspectCompany = typeof prospectCompanies.$inferSelect;
export type InsertProspectCompany = typeof prospectCompanies.$inferInsert;

export const prospectEmployees = mysqlTable(
  "prospect_employees",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId")
      .notNull()
      .references(() => prospectCompanies.id, { onDelete: "cascade", onUpdate: "cascade" }),
    firstName: varchar("firstName", { length: 128 }),
    lastName: varchar("lastName", { length: 128 }),
    fullName: varchar("fullName", { length: 256 }).notNull(),
    title: varchar("title", { length: 256 }),
    titleNormalized: varchar("titleNormalized", { length: 256 }),
    /** "c_level","head","director","manager","ic","unknown" */
    seniorityLevel: varchar("seniorityLevel", { length: 16 }).default("unknown").notNull(),
    locationCountry: varchar("locationCountry", { length: 2 }),
    locationAdmin1: varchar("locationAdmin1", { length: 8 }),
    locationCity: varchar("locationCity", { length: 128 }),
    linkedinUrl: varchar("linkedinUrl", { length: 512 }),
    email: varchar("email", { length: 320 }),
    /** Pattern code that produced `email`, e.g. "first.last", "f.last". */
    emailPattern: varchar("emailPattern", { length: 32 }),
    /** "unknown","mx_present","mx_absent","excluded" */
    emailStatus: varchar("emailStatus", { length: 16 }).default("unknown").notNull(),
    emailGuesses: json("emailGuesses").$type<string[]>(),
    source: varchar("source", { length: 32 }).default("unknown").notNull(),
    sourceEvidenceUrl: varchar("sourceEvidenceUrl", { length: 1024 }),
    /** 0–1 confidence for website-derived rows (`business_contacts`). Matches migration `DOUBLE`. */
    sourceConfidence: double("sourceConfidence"),
    firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
    lastVerifiedAt: timestamp("lastVerifiedAt"),
  },
  table => ({
    linkedinUrlUnique: uniqueIndex("prospect_employees_linkedin_unique").on(table.linkedinUrl),
    companyFullNameUnique: uniqueIndex("prospect_employees_company_fullname_unique").on(
      table.companyId,
      table.fullName,
    ),
  }),
);

export type ProspectEmployee = typeof prospectEmployees.$inferSelect;
export type InsertProspectEmployee = typeof prospectEmployees.$inferInsert;

export const prospectEmailPatterns = mysqlTable(
  "prospect_email_patterns",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId")
      .notNull()
      .references(() => prospectCompanies.id, { onDelete: "cascade", onUpdate: "cascade" }),
    /** Token pattern, e.g. "first.last","first","f.last","flast","first_last","last.first","first-last","last","lastf". */
    pattern: varchar("pattern", { length: 32 }).notNull(),
    observedCount: int("observedCount").default(0).notNull(),
    firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    companyPatternUnique: uniqueIndex("prospect_email_patterns_company_pattern_unique").on(
      table.companyId,
      table.pattern,
    ),
  }),
);

export type ProspectEmailPattern = typeof prospectEmailPatterns.$inferSelect;
export type InsertProspectEmailPattern = typeof prospectEmailPatterns.$inferInsert;

export const prospectCrawlSeeds = mysqlTable("prospect_crawl_seeds", {
  id: int("id").autoincrement().primaryKey(),
  /**
   * "linkedin_company_serp","linkedin_employee_serp","wikidata_region","sec_edgar","uk_ch","website_team_page".
   */
  kind: varchar("kind", { length: 32 }).notNull(),
  /** ISO country code, US state code, or "global". */
  region: varchar("region", { length: 16 }).default("global").notNull(),
  payload: json("payload").$type<Record<string, unknown>>(),
  frequencyMinutes: int("frequencyMinutes").default(360).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  consecutiveErrors: int("consecutiveErrors").default(0).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProspectCrawlSeed = typeof prospectCrawlSeeds.$inferSelect;
export type InsertProspectCrawlSeed = typeof prospectCrawlSeeds.$inferInsert;

export const prospectCrawlRuns = mysqlTable("prospect_crawl_runs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  seedId: int("seedId").references(() => prospectCrawlSeeds.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  kind: varchar("kind", { length: 32 }).notNull(),
  /** "ok","error","throttled" */
  status: varchar("status", { length: 16 }).default("ok").notNull(),
  itemsFound: int("itemsFound").default(0).notNull(),
  itemsNew: int("itemsNew").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
});

export type ProspectCrawlRun = typeof prospectCrawlRuns.$inferSelect;
export type InsertProspectCrawlRun = typeof prospectCrawlRuns.$inferInsert;

export const prospectCrawlQueue = mysqlTable("prospect_crawl_queue", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  /** "resolve_domain","crawl_website","guess_emails","verify_mx","harvest_employee" */
  kind: varchar("kind", { length: 32 }).notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  priority: int("priority").default(0).notNull(),
  availableAt: timestamp("availableAt").defaultNow().notNull(),
  attempts: int("attempts").default(0).notNull(),
  /** "pending","in_flight","done","dead" */
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  lockedBy: varchar("lockedBy", { length: 64 }),
  lockedAt: timestamp("lockedAt"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProspectCrawlQueue = typeof prospectCrawlQueue.$inferSelect;
export type InsertProspectCrawlQueue = typeof prospectCrawlQueue.$inferInsert;

export const prospectHostThrottle = mysqlTable("prospect_host_throttle", {
  host: varchar("host", { length: 255 }).primaryKey(),
  nextAllowedAt: timestamp("nextAllowedAt").defaultNow().notNull(),
  consecutiveErrors: int("consecutiveErrors").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProspectHostThrottle = typeof prospectHostThrottle.$inferSelect;
export type InsertProspectHostThrottle = typeof prospectHostThrottle.$inferInsert;

export const prospectDailyBudget = mysqlTable("prospect_daily_budget", {
  id: int("id").autoincrement().primaryKey(),
  /** YYYY-MM-DD UTC */
  bucketDay: varchar("bucketDay", { length: 10 }).notNull(),
  /** "http","serp" */
  bucketKind: varchar("bucketKind", { length: 16 }).notNull(),
  consumed: int("consumed").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  dayKindUnique: uniqueIndex("prospect_daily_budget_day_kind_unique").on(
    table.bucketDay,
    table.bucketKind,
  ),
}));

export type ProspectDailyBudget = typeof prospectDailyBudget.$inferSelect;
export type InsertProspectDailyBudget = typeof prospectDailyBudget.$inferInsert;

/** Singleton row `id = 1`: superadmin-tunable crawler limits (env caps still apply). */
export const prospectCrawlerSettings = mysqlTable("prospect_crawler_settings", {
  id: int("id").primaryKey().default(1),
  crawlerEnabled: boolean("crawlerEnabled").default(false).notNull(),
  schedulerEnabled: boolean("schedulerEnabled").default(false).notNull(),
  queuePaused: boolean("queuePaused").default(false).notNull(),
  seedTickIntervalMinutes: int("seedTickIntervalMinutes").default(60).notNull(),
  companyQueueTickIntervalMinutes: int("companyQueueTickIntervalMinutes").default(10).notNull(),
  employeeQueueTickIntervalMinutes: int("employeeQueueTickIntervalMinutes").default(30).notNull(),
  lastSeedTickAt: timestamp("lastSeedTickAt"),
  lastCompanyQueueTickAt: timestamp("lastCompanyQueueTickAt"),
  lastEmployeeQueueTickAt: timestamp("lastEmployeeQueueTickAt"),
  nextSeedTickAt: timestamp("nextSeedTickAt"),
  nextCompanyQueueTickAt: timestamp("nextCompanyQueueTickAt"),
  nextEmployeeQueueTickAt: timestamp("nextEmployeeQueueTickAt"),
  lastManualRunAt: timestamp("lastManualRunAt"),
  lastManualRunByUserId: int("lastManualRunByUserId").references(() => users.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  lastStopAt: timestamp("lastStopAt"),
  lastStopByUserId: int("lastStopByUserId").references(() => users.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  /** `company_safe` | `business_contacts` */
  dataMode: varchar("dataMode", { length: 32 }).default("company_safe").notNull(),
  dailyHttpBudget: int("dailyHttpBudget").default(50).notNull(),
  maxPerTick: int("maxPerTick").default(5).notNull(),
  fetchTimeoutMs: int("fetchTimeoutMs").default(8000).notNull(),
  fetchMaxBytes: int("fetchMaxBytes").default(1_000_000).notNull(),
  respectRobotsTxt: boolean("respectRobotsTxt").default(true).notNull(),
  aiExtractionEnabled: boolean("aiExtractionEnabled").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedByUserId: int("updatedByUserId").references(() => users.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
});

export type ProspectCrawlerSettings = typeof prospectCrawlerSettings.$inferSelect;
export type InsertProspectCrawlerSettings = typeof prospectCrawlerSettings.$inferInsert;

