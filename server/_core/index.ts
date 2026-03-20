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
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(
    express.json({
      limit: "50mb",
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
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    if (process.env.NODE_ENV === "development" && !process.env.DATABASE_URL?.trim()) {
      console.warn(
        "[Auth] DATABASE_URL is not set: using dev file store at .data/local-auth.json (users + login codes only).",
      );
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
