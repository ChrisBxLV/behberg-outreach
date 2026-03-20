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
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

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
export const campaignContacts = mysqlTable("campaign_contacts", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  contactId: int("contactId").notNull(),
  status: mysqlEnum("status", ["enrolled", "active", "completed", "unsubscribed", "bounced", "replied"]).default("enrolled").notNull(),
  currentStep: int("currentStep").default(0),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  nextSendAt: timestamp("nextSendAt"),
});

export type CampaignContact = typeof campaignContacts.$inferSelect;

// ─── Email Logs ───────────────────────────────────────────────────────────────
export const emailLogs = mysqlTable("email_logs", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  contactId: int("contactId").notNull(),
  sequenceStepId: int("sequenceStepId"),
  campaignContactId: int("campaignContactId"),
  // Email content
  subject: varchar("subject", { length: 512 }),
  body: text("body"),
  fromEmail: varchar("fromEmail", { length: 320 }),
  toEmail: varchar("toEmail", { length: 320 }),
  // Status
  status: mysqlEnum("status", ["queued", "sent", "failed", "bounced"]).default("queued").notNull(),
  // Tracking
  trackingId: varchar("trackingId", { length: 64 }).unique(), // UUID for pixel tracking
  openedAt: timestamp("openedAt"),
  openCount: int("openCount").default(0),
  repliedAt: timestamp("repliedAt"),
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

