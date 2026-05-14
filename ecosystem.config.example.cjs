/**
 * Example PM2 configuration: `cwd` is the repository root so `build-info.json`
 * (written by deploy.sh) and `package.json` resolve without extra env vars.
 *
 * Copy to `ecosystem.config.cjs`, adjust app names, then:
 *   pm2 start ecosystem.config.cjs
 *
 * If the process cannot use the repo as cwd, keep cwd as-is and set
 * `DEPLOY_ROOT` to the repository path in `env` instead.
 */
const path = require("node:path");

const root = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: "behberg-web",
      cwd: root,
      script: "start.mjs",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        // DEPLOY_ROOT: root,
      },
    },
    {
      name: "behberg-worker",
      cwd: root,
      script: "dist/worker.js",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        // DEPLOY_ROOT: root,
      },
    },
  ],
};
