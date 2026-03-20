import type { Express } from "express";
import multer from "multer";
import { importCsvContacts } from "./services/csvImport";
import { recordOpenEvent, unsubscribeByTrackingId } from "./db";
import { startScheduler } from "./services/sequenceScheduler";
import { sdk } from "./_core/sdk";

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
  // ── CSV Import ─────────────────────────────────────────────────────────────
  app.post("/api/import/csv", upload.single("file"), async (req, res) => {
    try {
      // Protect CSV import: it writes PII to your database.
      await sdk.authenticateRequest(req);

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const result = await importCsvContacts(req.file.buffer, req.file.originalname);
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
