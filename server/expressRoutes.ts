import type { Express } from "express";
import multer from "multer";
import { importCsvContacts } from "./services/csvImport";
import { applyProviderTrackingEvent, recordOpenEvent, unsubscribeByTrackingId } from "./db";
import { startScheduler } from "./services/sequenceScheduler";
import { resolveTenantQueryScope } from "./_core/authz";
import { sdk } from "./_core/sdk";
import { inferRequestOrigin } from "./_core/requestOrigin";
import { completeMailboxOAuthConnect } from "./services/mailboxConnectFlow";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export function registerExpressRoutes(app: Express) {
  // ── Mailbox OAuth callbacks ────────────────────────────────────────────────
  app.get("/api/mailboxes/oauth/:provider/callback", async (req, res) => {
    const appBaseUrl =
      process.env.APP_BASE_URL?.trim() ||
      inferRequestOrigin({
        protocol: req.protocol,
        headers: req.headers as any,
      }) ||
      "https://krot.io";
    const provider = String(req.params.provider ?? "").toLowerCase();
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const error = String(req.query.error ?? "");
    if (!state || (provider !== "google" && provider !== "microsoft")) {
      return res.redirect(`${appBaseUrl}/app/settings?mailbox_oauth_error=invalid_callback`);
    }
    try {
      const result = await completeMailboxOAuthConnect({
        provider: provider as "google" | "microsoft",
        state,
        code: code || undefined,
        providerError: error || undefined,
        appBaseUrl,
      });
      const params = new URLSearchParams();
      if (result.attemptId) params.set("mailbox_oauth_attempt", result.attemptId);
      params.set("mailbox_oauth_status", result.ok ? "success" : "error");
      if (!result.ok && result.reason) params.set("mailbox_oauth_reason", result.reason);
      return res.redirect(`${appBaseUrl}/app/settings?${params.toString()}`);
    } catch (callbackError: any) {
      console.error("[Mailbox OAuth] callback completion failed", {
        provider,
        stateLength: state.length,
        hasCode: Boolean(code),
        error: String(callbackError?.message ?? callbackError ?? "unknown"),
      });
      const params = new URLSearchParams({
        mailbox_oauth_status: "error",
        mailbox_oauth_reason: "unknown",
      });
      return res.redirect(`${appBaseUrl}/app/settings?${params.toString()}`);
    }
  });

  // ── Mailbox webhook intake (normalized minimal path) ───────────────────────
  app.post("/api/mailboxes/webhooks/:provider", async (req, res) => {
    const provider = String(req.params.provider ?? "").toLowerCase();
    const challenge = String(req.query.validationToken ?? "");
    if (provider === "microsoft" && challenge) {
      return res.status(200).send(challenge);
    }
    const providerMessageId = String((req.body?.providerMessageId ?? req.body?.messageId ?? "") || "");
    const eventTypeRaw = String((req.body?.eventType ?? req.body?.type ?? "") || "").toLowerCase();
    const eventType =
      eventTypeRaw === "open" || eventTypeRaw === "reply" || eventTypeRaw === "bounce"
        ? eventTypeRaw
        : null;
    if (providerMessageId && eventType) {
      await applyProviderTrackingEvent({ providerMessageId, eventType });
    }
    console.info(`[MailWebhook] provider=${provider}`, {
      googleResourceId: req.headers["x-goog-resource-id"] ?? null,
      microsoftSubscriptionId: req.headers["x-ms-subscription-id"] ?? null,
      providerMessageId: providerMessageId || null,
      eventType: eventType || null,
    });
    res.status(202).json({ ok: true });
  });

  // ── CSV Import ─────────────────────────────────────────────────────────────
  app.post("/api/import/csv", upload.single("file"), async (req, res) => {
    try {
      // Protect CSV import: it writes PII to your database.
      const user = await sdk.authenticateRequest(req);

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const scope = resolveTenantQueryScope(user);
      if (scope == null) {
        return res.status(403).json({ error: "Organization context required" });
      }
      const result = await importCsvContacts(req.file.buffer, req.file.originalname, {
        organizationId: user.organizationId ?? null,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error("[CSV Import] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Email Open Tracking Pixel ──────────────────────────────────────────────
  app.get("/api/track/:trackingId.gif", async (req, res) => {
    const { trackingId } = req.params;

    // Respond immediately with pixel
    res.set({
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.send(TRACKING_PIXEL);

    // Record event asynchronously
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] ?? req.ip ?? "";
      const userAgent = req.headers["user-agent"] ?? "";
      await recordOpenEvent(trackingId, ip, userAgent);
    } catch (err: any) {
      console.error("[Tracking] Error recording open:", err.message);
    }
  });

  // ── Unsubscribe (by tracking id) ───────────────────────────────────────────
  app.get("/api/unsubscribe/:trackingId", async (req, res) => {
    const { trackingId } = req.params;
    try {
      const ok = await unsubscribeByTrackingId(trackingId);
      res
        .status(ok ? 200 : 404)
        .set({ "Content-Type": "text/html; charset=utf-8" })
        .send(
          ok
            ? "<html><body><h2>Unsubscribed</h2><p>You will no longer receive emails from us.</p></body></html>"
            : "<html><body><h2>Not found</h2><p>This unsubscribe link is invalid.</p></body></html>"
        );
    } catch (err: any) {
      console.error("[Unsubscribe] Error:", err.message);
      res
        .status(500)
        .set({ "Content-Type": "text/html; charset=utf-8" })
        .send("<html><body><h2>Error</h2><p>Could not process unsubscribe.</p></body></html>");
    }
  });

  // ── Start background scheduler ─────────────────────────────────────────────
  const disableSchedulerRaw = process.env.DISABLE_SCHEDULER ?? "";
  const disableScheduler = disableSchedulerRaw.trim().toLowerCase();

  // Treat common "truthy" values as disable.
  const schedulerDisabled =
    disableScheduler === "1" || disableScheduler === "true" || disableScheduler === "yes";

  if (!schedulerDisabled) {
    startScheduler();
  } else {
    console.log(`[Scheduler] Disabled via DISABLE_SCHEDULER=${JSON.stringify(disableSchedulerRaw)}`);
  }
}
