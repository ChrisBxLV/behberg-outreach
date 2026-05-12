import "dotenv/config";
import { assertRequiredProductionEnv, ENV } from "./_core/env";
import { startScheduler } from "./services/sequenceScheduler";

function installFatalHandlers() {
  process.on("unhandledRejection", reason => {
    console.error("[Worker] Unhandled promise rejection:", reason);
  });
  process.on("uncaughtException", err => {
    console.error("[Worker] Uncaught exception:", err);
    // Don't keep running in an unknown state in production; let the process
    // manager (PM2, systemd, k8s, etc.) restart us cleanly.
    if (ENV.isProduction) {
      process.exit(1);
    }
  });
}

async function startWorker() {
  assertRequiredProductionEnv();
  installFatalHandlers();
  startScheduler();
  console.log(
    `[Worker] Background worker started (nodeEnv=${process.env.NODE_ENV ?? "unknown"}).`,
  );
}

startWorker().catch(err => {
  console.error("[Worker] Fatal startup error:", err);
  process.exit(1);
});
