import express, { type Express } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import multer from "multer";
import { importCsvContacts } from "./services/csvImport";
import {
  applyProviderTrackingEvent,
  getMailboxIdByProviderSubscriptionId,
  recordOpenEvent,
  unsubscribeByTrackingId,
} from "./db";
import { startScheduler } from "./services/sequenceScheduler";
import { resolveTenantQueryScope } from "./_core/authz";
import { sdk } from "./_core/sdk";
import { inferRequestOrigin } from "./_core/requestOrigin";
import { completeMailboxOAuthConnect } from "./services/mailboxConnectFlow";
import { validateMicrosoftClientState } from "./services/microsoftGraphSubscription";
import { tryIngestSesOrSnsBounceNotification } from "./services/sesBounceIngest";
import { ENV } from "./_core/env";

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

const signatureImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
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

  // ── Mailbox webhook intake (Graph batch + manual JSON) ────────────────────
  app.post("/api/mailboxes/webhooks/:provider", async (req, res) => {
    const provider = String(req.params.provider ?? "").toLowerCase();
    const challenge = String(req.query.validationToken ?? req.query.validationtoken ?? "");
    if (provider === "microsoft" && challenge) {
      return res.status(200).type("text/plain").send(challenge);
    }
    if (provider === "microsoft" && Array.isArray(req.body?.value)) {
      for (const n of req.body.value as {
        clientState?: string;
        resourceData?: { id?: string };
        resource?: string;
        changeType?: string;
        subscriptionId?: string;
      }[]) {
        if (!validateMicrosoftClientState(n?.clientState)) {
          continue;
        }
        const subId = String(n.subscriptionId ?? "");
        const mailboxId = subId ? await getMailboxIdByProviderSubscriptionId(subId) : null;
        if (!mailboxId) {
          continue;
        }
        let messageId: string | null = n?.resourceData?.id ?? null;
        if (!messageId && n.resource) {
          const resStr = String(n.resource);
          const m =
            resStr.match(/messages\/([^/?]+)\s*$/i) ||
            resStr.match(/['"]messages['"]\/([A-Za-z0-9+=_-]+)/i);
          if (m?.[1]) {
            try {
              messageId = decodeURIComponent(m[1]!);
            } catch {
              messageId = m[1]!;
            }
          }
        }
        if (!messageId) {
          continue;
        }
        const ct = String(n.changeType ?? "").toLowerCase();
        if (ct && ct !== "created" && ct !== "updated") {
          continue;
        }
        await applyProviderTrackingEvent({
          providerMessageId: String(messageId),
          eventType: "reply",
          mailboxId,
        });
      }
      return res.status(202).json({ ok: true });
    }

    const providerMessageId = String((req.body?.providerMessageId ?? req.body?.messageId ?? "") || "");
    const eventTypeRaw = String((req.body?.eventType ?? req.body?.type ?? "") || "").toLowerCase();
    const eventType =
      eventTypeRaw === "open" || eventTypeRaw === "reply" || eventTypeRaw === "bounce"
        ? eventTypeRaw
        : null;
    const mailboxIdRaw = req.body?.mailboxId;
    const mailboxId = typeof mailboxIdRaw === "number" ? mailboxIdRaw : parseInt(String(mailboxIdRaw ?? ""), 10);
    if (providerMessageId && eventType) {
      await applyProviderTrackingEvent({
        providerMessageId,
        eventType,
        mailboxId: Number.isFinite(mailboxId) && mailboxId > 0 ? mailboxId : undefined,
      });
    }
    console.info(`[MailWebhook] provider=${provider}`, {
      googleResourceId: req.headers["x-goog-resource-id"] ?? null,
      microsoftSubscriptionId: req.headers["x-ms-subscription-id"] ?? null,
      providerMessageId: providerMessageId || null,
      eventType: eventType || null,
    });
    res.status(202).json({ ok: true });
  });

  // ── Bounce: SES / SNS (and manual tests) ─────────────────────────────────
  app.post("/api/webhooks/ses", async (req, res) => {
    try {
      const ok = await tryIngestSesOrSnsBounceNotification(req.body);
      res.status(202).json({ ok, matched: ok });
    } catch (e: any) {
      console.error("[SES bounce]", e?.message);
      res.status(500).json({ ok: false });
    }
  });

  // ── Bounce: provider id only (e.g. Graph / manual wiring) ────────────────
  app.post("/api/mailboxes/webhooks/bounce", express.json(), async (req, res) => {
    const providerMessageId = String((req.body?.providerMessageId ?? req.body?.messageId ?? "") || "").trim();
    if (providerMessageId) {
      await applyProviderTrackingEvent({ providerMessageId, eventType: "bounce" });
    }
    res.status(202).json({ ok: true });
  });

  // ── Public signature assets (emails need absolute unauthenticated URLs) ────
  const effectiveSigDir = ENV.signatureAssetsDir
    ? path.resolve(ENV.signatureAssetsDir)
    : path.join(process.cwd(), "data", "signature-assets");

  app.get("/api/public/signature-assets/:fileName", async (req, res) => {
    const fileName = path.basename(String(req.params.fileName ?? ""));
    if (!/^[a-zA-Z0-9._-]+\.(png|jpe?g|gif|webp|svg)$/.test(fileName)) {
      return res.status(400).end();
    }
    const p = path.join(effectiveSigDir, fileName);
    try {
      const buf = await fs.readFile(p);
      const ext = path.extname(fileName).toLowerCase();
      const ct =
        ext === ".png" ? "image/png" :
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
        ext === ".gif" ? "image/gif" :
        ext === ".webp" ? "image/webp" :
        ext === ".svg" ? "image/svg+xml" :
        "application/octet-stream";
      res.set("Content-Type", ct);
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(200).send(buf);
    } catch {
      return res.status(404).end();
    }
  });

  app.post(
    "/api/mailboxes/signature-asset",
    signatureImageUpload.single("file"),
    async (req, res) => {
      try {
        const user = await sdk.authenticateRequest(req);
        if (!user.organizationId) {
          return res.status(403).json({ error: "Organization required" });
        }
        const mailboxId = parseInt(String(req.body?.mailboxId ?? ""), 10);
        if (!Number.isFinite(mailboxId) || mailboxId < 1) {
          return res.status(400).json({ error: "mailboxId required" });
        }
        const { getMailboxById } = await import("./db");
        const mb = await getMailboxById(mailboxId);
        if (!mb || mb.organizationId !== user.organizationId) {
          return res.status(404).json({ error: "Mailbox not found" });
        }
        const isAdmin = user.role === "admin" || user.role === "superadmin";
        const isOwner = user.orgMemberRole === "owner";
        const canEdit = isAdmin || isOwner || (mb.connectedByUserId != null && mb.connectedByUserId === user.id);
        if (!canEdit) {
          return res.status(403).json({ error: "Forbidden" });
        }
        if (!req.file?.buffer?.length) {
          return res.status(400).json({ error: "file required" });
        }
        await fs.mkdir(effectiveSigDir, { recursive: true });
        const ext = path.extname(req.file.originalname || "logo.png") || ".png";
        const name = `${nanoid(24)}${ext.toLowerCase().replace(/[^a-z0-9.]/g, "") || ".png"}`;
        await fs.writeFile(path.join(effectiveSigDir, name), req.file.buffer);
        const base =
          ENV.appBaseUrl ||
          process.env.APP_BASE_URL?.replace(/\/$/, "") ||
          inferRequestOrigin({ protocol: req.protocol, headers: req.headers as any }) ||
          "";
        if (!base) {
          return res.status(500).json({ error: "APP_BASE_URL is not configured" });
        }
        return res.json({ url: `${base}/api/public/signature-assets/${name}` });
      } catch (e: any) {
        if (e?.message === "Unauthorized" || e?.code === "UNAUTHORIZED") {
          return res.status(401).json({ error: "Unauthorized" });
        }
        console.error("[signature-asset]", e);
        return res.status(500).json({ error: e?.message ?? "upload failed" });
      }
    },
  );

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

  // ── Public one-click unsubscribe (signed token) ───────────────────────────
  app.get("/api/public/unsubscribe", async (req, res) => {
    const token = String((req.query as { token?: string }).token ?? "");
    const appBase =
      process.env.APP_BASE_URL?.replace(/\/$/, "") ||
      inferRequestOrigin({
        protocol: req.protocol,
        headers: req.headers as any,
      }) ||
      "http://localhost:3000";
    try {
      const { verifyUnsubscribeToken } = await import("./services/unsubscribeToken");
      const { completeUnsubscribeByMailboxAndContact } = await import("./db");
      const payload = verifyUnsubscribeToken(token);
      if (!payload) {
        return res.redirect(302, `${appBase}/unsubscribe?status=invalid`);
      }
      const ok = await completeUnsubscribeByMailboxAndContact(
        payload.mailboxId,
        payload.contactId,
        payload.email,
        "link_click",
      );
      return res.redirect(302, `${appBase}/unsubscribe?status=${ok ? "ok" : "invalid"}`);
    } catch (e: any) {
      console.error("[Unsubscribe]", e?.message);
      return res.redirect(302, `${appBase}/unsubscribe?status=error`);
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
