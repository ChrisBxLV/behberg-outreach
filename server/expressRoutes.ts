import type { Express } from "express";
import multer from "multer";
import { importCsvContacts } from "./services/csvImport";
import { recordOpenEvent } from "./db";
import { startScheduler } from "./services/sequenceScheduler";

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

  // ── Google Sheets OAuth Callback ───────────────────────────────────────────
  app.get("/api/sheets/callback", async (req, res) => {
    const { code, error } = req.query;

    if (error) {
      return res.redirect(`/?sheets_error=${encodeURIComponent(String(error))}`);
    }

    if (!code) {
      return res.redirect("/?sheets_error=no_code");
    }

    try {
      const { exchangeCodeForTokens } = await import("./services/sheetsSync");
      await exchangeCodeForTokens(String(code));
      res.redirect("/settings?sheets_connected=1");
    } catch (err: any) {
      console.error("[Sheets OAuth] Error:", err.message);
      res.redirect(`/settings?sheets_error=${encodeURIComponent(err.message)}`);
    }
  });

  // ── Start background scheduler ─────────────────────────────────────────────
  startScheduler();
}
