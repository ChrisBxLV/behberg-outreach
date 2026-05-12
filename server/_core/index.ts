import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerExpressRoutes } from "../expressRoutes";
import { agentDebugLog } from "./agentDebugLog";
import { assertRequiredProductionEnv, ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  assertRequiredProductionEnv();

  const app = express();
  const server = createServer(app);
  // Keep global parsers tight; upload routes should opt into larger limits locally.
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, res, buf) => {
        try {
          const pathHint = (req as { originalUrl?: string }).originalUrl ?? req.url ?? "";
          if (req.method !== "POST" || !pathHint.includes("/api/trpc")) return;
          const parsed = JSON.parse(buf.toString()) as Record<string, unknown>;
          const first = parsed["0"] ?? Object.values(parsed)[0];
          const inner =
            first && typeof first === "object" && first !== null && "json" in first
              ? (first as { json?: unknown }).json
              : first;
          const inputKeys =
            inner && typeof inner === "object" && inner !== null && !Array.isArray(inner)
              ? Object.keys(inner as Record<string, unknown>)
              : [];
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H_BODY",
            location: "server/_core/index.ts:json-verify",
            message: "tRPC POST body key shape (no values)",
            data: { inputKeys, urlSnippet: pathHint.slice(0, 200) },
          });
          // #endregion
        } catch {
          /* ignore parse errors */
        }
      },
    })
  );
  app.use(express.urlencoded({ limit: "2mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Custom routes: CSV import, tracking pixel, Sheets OAuth callback, scheduler
  registerExpressRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    (req, res, next) => {
      // #region agent log
      agentDebugLog({
        runId: "baseline",
        hypothesisId: "H_HTTP",
        location: "server/_core/index.ts:trpc-request",
        message: "Incoming tRPC HTTP",
        data: { method: req.method, urlSnippet: (req.originalUrl ?? "").slice(0, 220) },
      });
      // #endregion
      next();
    },
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = ENV.isProduction ? preferredPort : await findAvailablePort(preferredPort);

  if (!ENV.isProduction && port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    if (process.env.NODE_ENV === "development" && !process.env.DATABASE_URL?.trim()) {
      console.warn(
        "[Auth] DATABASE_URL is not set: using dev file store at .data/local-auth.json (users + login codes only).",
      );
    }
    const encryptionSecretConfigured = Boolean(
      process.env.MAILBOX_TOKEN_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim(),
    );
    const missingOAuthEnv = [
      !process.env.APP_BASE_URL?.trim() ? "APP_BASE_URL" : null,
      !process.env.GOOGLE_MAIL_CLIENT_ID?.trim() ? "GOOGLE_MAIL_CLIENT_ID" : null,
      !process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() ? "GOOGLE_MAIL_CLIENT_SECRET" : null,
      !process.env.MS_MAIL_CLIENT_ID?.trim() ? "MS_MAIL_CLIENT_ID" : null,
      !process.env.MS_MAIL_CLIENT_SECRET?.trim() ? "MS_MAIL_CLIENT_SECRET" : null,
      !encryptionSecretConfigured ? "MAILBOX_TOKEN_ENCRYPTION_KEY or JWT_SECRET" : null,
    ].filter(Boolean);
    if (missingOAuthEnv.length > 0) {
      console.warn(`[MailboxOAuth] Missing env: ${missingOAuthEnv.join(", ")}`);
    }
    // #region agent log
    agentDebugLog({
      runId: "baseline",
      hypothesisId: "H0",
      location: "server/_core/index.ts:listen",
      message: "Server started",
      data: { port, nodeEnv: process.env.NODE_ENV ?? "unknown" },
    });
    // #endregion
  });
}

startServer().catch(console.error);
