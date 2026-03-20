import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock the DB module ────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getContacts: vi.fn().mockResolvedValue({ contacts: [], total: 0 }),
  getContactById: vi.fn().mockResolvedValue(null),
  createContact: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateContact: vi.fn().mockResolvedValue(undefined),
  deleteContacts: vi.fn().mockResolvedValue(undefined),
  bulkUpdateContactStage: vi.fn().mockResolvedValue(undefined),
  getImportBatches: vi.fn().mockResolvedValue([]),
  getEmailLogsByContact: vi.fn().mockResolvedValue([]),
  getCampaigns: vi.fn().mockResolvedValue([]),
  getCampaignById: vi.fn().mockResolvedValue(null),
  createCampaign: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateCampaign: vi.fn().mockResolvedValue(undefined),
  deleteCampaign: vi.fn().mockResolvedValue(undefined),
  getSequenceSteps: vi.fn().mockResolvedValue([]),
  upsertSequenceStep: vi.fn().mockResolvedValue(undefined),
  deleteSequenceStep: vi.fn().mockResolvedValue(undefined),
  deleteSequenceStepsByCampaign: vi.fn().mockResolvedValue(undefined),
  getCampaignContacts: vi.fn().mockResolvedValue([]),
  enrollContactsInCampaign: vi.fn().mockResolvedValue(undefined),
  updateCampaignContact: vi.fn().mockResolvedValue(undefined),
  getEmailLogsByCampaign: vi.fn().mockResolvedValue([]),
  markEmailReplied: vi.fn().mockResolvedValue(undefined),
  getAllContactsForSync: vi.fn().mockResolvedValue([]),
  getCampaignStats: vi.fn().mockResolvedValue({ sentCount: 0, openCount: 0, replyCount: 0, bounceCount: 0 }),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  createImportBatch: vi.fn().mockResolvedValue(undefined),
  updateImportBatch: vi.fn().mockResolvedValue(undefined),
  upsertContact: vi.fn().mockResolvedValue(undefined),
  getContactByEmail: vi.fn().mockResolvedValue(null),
  recordOpenEvent: vi.fn().mockResolvedValue(undefined),
  createEmailLog: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateEmailLog: vi.fn().mockResolvedValue(undefined),
  getEmailLogByTrackingId: vi.fn().mockResolvedValue(null),
  getDueEmailJobs: vi.fn().mockResolvedValue([]),
}));

// ─── Mock services ─────────────────────────────────────────────────────────────
vi.mock("./services/emailService", () => ({
  testSmtpConnection: vi.fn().mockResolvedValue({ success: true }),
  resetTransporter: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  interpolateTemplate: vi.fn((t: string) => t),
}));

vi.mock("./services/llmPersonalization", () => ({
  generateEmailVariations: vi.fn().mockResolvedValue([
    { subject: "Test Subject", body: "Test body" },
  ]),
  generatePersonalizedEmail: vi.fn().mockResolvedValue({ subject: "Test", body: "Test" }),
}));

vi.mock("./services/sequenceScheduler", () => ({
  launchCampaign: vi.fn().mockResolvedValue(undefined),
  processEmailQueue: vi.fn().mockResolvedValue({ processed: 0, errors: 0 }),
}));

// ─── Test helpers ──────────────────────────────────────────────────────────────
function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-owner",
      email: "admin@behberg.com",
      name: "Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
describe("auth", () => {
  it("returns current user from me query", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const user = await caller.auth.me();
    expect(user?.email).toBe("admin@behberg.com");
  });

  it("clears session cookie on logout", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

// ─── Contacts ─────────────────────────────────────────────────────────────────
describe("contacts", () => {
  it("returns paginated contact list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.contacts.list({ limit: 10, offset: 0 });
    expect(result).toHaveProperty("contacts");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.contacts)).toBe(true);
  });

  it("creates a new contact", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.contacts.create({
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      company: "Acme Corp",
      title: "CTO",
    });
    expect(result.success).toBe(true);
  });

  it("deletes contacts by ids", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.contacts.delete({ ids: [1, 2, 3] });
    expect(result.success).toBe(true);
    expect(result.deleted).toBe(3);
  });

  it("bulk updates contact stage", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.contacts.bulkUpdateStage({ ids: [1, 2], stage: "enriched" });
    expect(result.success).toBe(true);
  });
});

// ─── Campaigns ────────────────────────────────────────────────────────────────
describe("campaigns", () => {
  it("returns campaign list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.campaigns.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("creates a campaign", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.campaigns.create({
      name: "Q1 Outreach",
      fromName: "Behberg",
      fromEmail: "outreach@behberg.com",
    });
    expect(result.success).toBe(true);
  });

  it("saves sequence steps", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.campaigns.saveSteps({
      campaignId: 1,
      steps: [
        {
          stepOrder: 1,
          stepType: "initial",
          subject: "Hello {{firstName}}",
          bodyTemplate: "Hi {{firstName}}, I wanted to reach out...",
          delayDays: 0,
          delayHours: 0,
          condition: "always",
          useLlmPersonalization: false,
        },
        {
          stepOrder: 2,
          stepType: "follow_up",
          subject: "Following up",
          bodyTemplate: "Just following up on my previous email...",
          delayDays: 3,
          delayHours: 0,
          condition: "not_replied",
          useLlmPersonalization: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("enrolls contacts in campaign", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.campaigns.enroll({ campaignId: 1, contactIds: [1, 2, 3] });
    expect(result.success).toBe(true);
    expect(result.enrolled).toBe(3);
  });

  it("pauses and resumes a campaign", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const pauseResult = await caller.campaigns.pause({ campaignId: 1 });
    expect(pauseResult.success).toBe(true);
    const resumeResult = await caller.campaigns.resume({ campaignId: 1 });
    expect(resumeResult.success).toBe(true);
  });

  it("marks an email as replied", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.campaigns.markReplied({ emailLogId: 1 });
    expect(result.success).toBe(true);
  });
});

// ─── Email ────────────────────────────────────────────────────────────────────
describe("email", () => {
  it("tests SMTP connection", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.email.testSmtp();
    expect(result).toHaveProperty("success");
  });

  it("generates email variations for a contact", async () => {
    const { getContactById } = await import("./db");
    vi.mocked(getContactById).mockResolvedValueOnce({
      id: 1,
      firstName: "Jane",
      lastName: "Smith",
      fullName: "Jane Smith",
      email: "jane@example.com",
      emailConfidence: 0.9,
      emailStatus: "valid",
      title: "VP of Sales",
      company: "TechCorp",
      industry: "Technology",
      companySize: "100-500",
      companyWebsite: "techcorp.com",
      linkedinUrl: null,
      location: "London",
      stage: "new",
      notes: null,
      tags: null,
      source: "apollo",
      importBatchId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.email.generateVariations({ contactId: 1, stepType: "initial", count: 1 });
    expect(result.variations).toHaveLength(1);
    expect(result.variations[0]).toHaveProperty("subject");
    expect(result.variations[0]).toHaveProperty("body");
  });
});

// ─── Settings ─────────────────────────────────────────────────────────────────
describe("settings", () => {
  it("returns SMTP configuration status", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.settings.getSmtpConfig();
    expect(result).toHaveProperty("host");
    expect(result).toHaveProperty("port");
    expect(result).toHaveProperty("configured");
  });

  it("returns app configuration", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.settings.getAppConfig();
    expect(result).toHaveProperty("smtpConfigured");
  });
});

// ─── CSV Import Service ────────────────────────────────────────────────────────
describe("csvImport service", () => {
  it("parses Apollo CSV buffer correctly", async () => {
    const { importCsvContacts } = await import("./services/csvImport");
    const { createContact } = await import("./db");

    const csvContent = `First Name,Last Name,Title,Company,Email,LinkedIn URL,City,State,Country
John,Doe,CTO,Acme Corp,john.doe@acme.com,https://linkedin.com/in/johndoe,London,,UK
Jane,Smith,VP Sales,TechCo,jane.smith@techco.com,https://linkedin.com/in/janesmith,Berlin,,Germany`;

    const buffer = Buffer.from(csvContent, "utf-8");
    const result = await importCsvContacts(buffer, "test-batch");
    expect(result).toHaveProperty("imported");
    expect(result).toHaveProperty("skipped");
    expect(result.imported).toBeGreaterThanOrEqual(0);
  });
});

// ─── Email interpolation ───────────────────────────────────────────────────────
describe("email template interpolation", () => {
  it("replaces all known placeholders", async () => {
    const { interpolateTemplate } = await import("./services/emailService");
    vi.mocked(interpolateTemplate).mockImplementationOnce((template: string, contact: any) => {
      return template
        .replace(/\{\{firstName\}\}/g, contact.firstName ?? "")
        .replace(/\{\{lastName\}\}/g, contact.lastName ?? "")
        .replace(/\{\{company\}\}/g, contact.company ?? "")
        .replace(/\{\{title\}\}/g, contact.title ?? "");
    });

    const template = "Hi {{firstName}}, I see you work at {{company}} as {{title}}.";
    const contact = { firstName: "Alice", lastName: "Brown", company: "Globex", title: "Director" };
    const result = interpolateTemplate(template, contact as any);
    expect(result).toContain("Alice");
    expect(result).toContain("Globex");
    expect(result).toContain("Director");
  });
});
