import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

const wantsDev =
  args.map(String).join(" ").toLowerCase().includes("dev") ||
  args.includes("--dev");

const distIndex = path.join(process.cwd(), "dist", "index.js");
const hasDistIndex = existsSync(distIndex);

if (wantsDev || !hasDistIndex) {
  // If the user runs `npm restart dev` or haven't built yet, run dev instead.
  // This prevents "Cannot find module dist/index.js" during local development.
  const child = spawn(process.execPath, ["dev.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  const child = spawn(process.execPath, [distIndex], {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

