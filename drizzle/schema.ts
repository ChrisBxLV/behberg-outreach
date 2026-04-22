import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
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

// ─── Contacts ─────────────────────────────────────────────────────────────────
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  // Identity
  firstName: varchar("firstName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }),
  fullName: varchar("fullName", { length: 256 }),
  email: varchar("email", { length: 320 }),
  emailConfidence: float("emailConfidence"), // 0-1 from Apollo
  emailStatus: mysqlEnum("emailStatus", ["unknown", "valid", "invalid", "catch_all", "risky"]).default("unknown"),
  // Professional
  title: varchar("title", { length: 256 }),
  company: varchar("company", { length: 256 }),
  industry: varchar("industry", { length: 256 }),
  companySize: varchar("companySize", { length: 64 }),
  companyWebsite: varchar("companyWebsite", { length: 512 }),
  linkedinUrl: varchar("linkedinUrl", { length: 512 }),
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

