import { spawn } from "node:child_process";
import path from "node:path";

// Always set env vars in-process so PowerShell/cmd doesn't need POSIX-style syntax.
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.OAUTH_SERVER_URL =
  process.env.OAUTH_SERVER_URL || "http://localhost:3000/api/oauth/callback";

const binDir = path.resolve("node_modules", ".bin");
const tsxBin = path.join(
  binDir,
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

const spawnArgs = ["watch", "server/_core/index.ts"];
const isWinCmd = process.platform === "win32" && tsxBin.toLowerCase().endsWith(".cmd");

let child;
if (isWinCmd) {
  // Windows + paths with spaces:
  // Spawn command line via cmd.exe to handle quoted paths reliably.
  const cmdLine = `"${tsxBin}" ${spawnArgs.map(a => `"${a}"`).join(" ")}`;
  child = spawn(cmdLine, {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
    shell: true,
  });
} else {
  child = spawn(tsxBin, spawnArgs, {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
}

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

