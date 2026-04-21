/**
 * Live mailbox OAuth readiness + auth smoke check.
 *
 * Usage:
 *   LIVE_BASE_URL=https://krot.io LIVE_LOGIN_ID=behberg LIVE_PASSWORD=... node scripts/verify-live-mailbox-oauth.mjs
 *
 * Optional:
 *   LIVE_EXPECT_APP_BASE_URL=https://krot.io
 */
import "dotenv/config";

const baseUrl = (process.env.LIVE_BASE_URL ?? "").trim().replace(/\/+$/, "");
const loginId = (process.env.LIVE_LOGIN_ID ?? "").trim().toLowerCase();
const password = process.env.LIVE_PASSWORD ?? "";
const expectedAppBaseUrl = (process.env.LIVE_EXPECT_APP_BASE_URL ?? "").trim();

if (!baseUrl || !loginId || !password) {
  console.error(
    "Missing required env. Set LIVE_BASE_URL, LIVE_LOGIN_ID, and LIVE_PASSWORD.",
  );
  process.exit(1);
}

const checks = [];
let failed = false;

function pass(label, details) {
  checks.push({ level: "PASS", label, details });
}

function warn(label, details) {
  checks.push({ level: "WARN", label, details });
}

function fail(label, details) {
  failed = true;
  checks.push({ level: "FAIL", label, details });
}

async function callTrpc(path, payload, cookie) {
  const response = await fetch(`${baseUrl}/api/trpc/${path}?batch=1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ 0: { json: payload } }),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keep raw text path if parse fails
  }
  return {
    status: response.status,
    setCookie: response.headers.get("set-cookie") || "",
    text,
    json,
  };
}

async function queryTrpc(path, cookie) {
  const response = await fetch(`${baseUrl}/api/trpc/${path}?batch=1&input=%7B%7D`, {
    headers: {
      ...(cookie ? { cookie } : {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keep raw text path if parse fails
  }
  return { status: response.status, text, json };
}

function trpcData(result) {
  return result?.json?.[0]?.result?.data?.json ?? null;
}

function trpcError(result) {
  const e = result?.json?.[0]?.error?.json;
  if (!e) return null;
  return {
    message: e.message ?? "Unknown tRPC error",
    code: e?.data?.code ?? null,
    path: e?.data?.path ?? null,
    httpStatus: e?.data?.httpStatus ?? null,
  };
}

async function main() {
  const health = await fetch(baseUrl, { method: "GET" });
  if (health.ok) {
    pass("Site reachable", `GET ${baseUrl} -> ${health.status}`);
  } else {
    fail("Site reachable", `GET ${baseUrl} -> ${health.status}`);
  }

  const login = await callTrpc("auth.requestLoginCode", { loginId, password });
  const loginData = trpcData(login);
  const loginErr = trpcError(login);
  const sessionCookie = login.setCookie.split(";")[0];
  if (login.status === 200 && loginData?.success && sessionCookie) {
    pass("Password login", "Session cookie issued.");
  } else {
    fail(
      "Password login",
      loginErr?.message ??
        `Unexpected response: status=${login.status} body=${login.text.slice(0, 220)}`,
    );
  }

  if (!sessionCookie) {
    printResults();
    process.exit(1);
  }

  const me = await queryTrpc("auth.me", sessionCookie);
  const meData = trpcData(me);
  const meErr = trpcError(me);
  if (me.status !== 200 || !meData) {
    fail(
      "auth.me",
      meErr?.message ?? `Unexpected response: status=${me.status} body=${me.text.slice(0, 220)}`,
    );
  } else {
    pass(
      "auth.me",
      `role=${String(meData.role ?? "null")} organizationId=${String(meData.organizationId ?? "null")}`,
    );
    if ("passwordSalt" in meData || "passwordHash" in meData) {
      fail("auth.me sanitization", "Sensitive password fields are exposed.");
    } else {
      pass("auth.me sanitization", "No passwordSalt/passwordHash fields found.");
    }
  }

  const oauthCfg = await queryTrpc("settings.getMailboxOAuthConfig", sessionCookie);
  const oauthCfgData = trpcData(oauthCfg);
  const oauthCfgErr = trpcError(oauthCfg);
  if (oauthCfg.status !== 200 || !oauthCfgData) {
    fail(
      "settings.getMailboxOAuthConfig",
      oauthCfgErr?.message ??
        `Unexpected response: status=${oauthCfg.status} body=${oauthCfg.text.slice(0, 220)}`,
    );
  } else {
    pass("OAuth config endpoint", "Fetched mailbox OAuth config.");
    const appBase = String(oauthCfgData.appBaseUrl ?? "");
    if (!appBase) {
      fail("APP_BASE_URL readiness", "appBaseUrl is empty in live config.");
    } else if (expectedAppBaseUrl && appBase !== expectedAppBaseUrl) {
      fail(
        "APP_BASE_URL readiness",
        `Expected ${expectedAppBaseUrl} but server reports ${appBase}.`,
      );
    } else {
      pass("APP_BASE_URL readiness", `appBaseUrl=${appBase}`);
    }

    if (oauthCfgData.tokenEncryptionConfigured) {
      pass("Token encryption readiness", "Encryption secret is configured.");
    } else {
      fail("Token encryption readiness", "No encryption secret configured.");
    }

    if (oauthCfgData.googleConfigured) {
      pass("Google OAuth readiness", "Google mailbox credentials configured.");
    } else {
      warn("Google OAuth readiness", "Google mailbox credentials are missing.");
    }

    if (oauthCfgData.microsoftConfigured) {
      pass("Microsoft OAuth readiness", "Microsoft mailbox credentials configured.");
    } else {
      warn("Microsoft OAuth readiness", "Microsoft mailbox credentials are missing.");
    }
  }

  for (const provider of ["google", "microsoft"]) {
    const start = await callTrpc("mailboxes.startConnectOAuth", { provider }, sessionCookie);
    const startData = trpcData(start);
    const startErr = trpcError(start);
    if (start.status === 200 && typeof startData?.authorizeUrl === "string") {
      pass(`${provider} connect start`, "Authorize URL returned.");
      continue;
    }
    if (startErr?.message?.includes("Organization context required")) {
      fail(
        `${provider} connect start`,
        "No organization context on this account (organizationId is null).",
      );
      continue;
    }
    if (startErr?.code === "PRECONDITION_FAILED") {
      fail(`${provider} connect start`, startErr.message);
      continue;
    }
    fail(
      `${provider} connect start`,
      startErr?.message ??
        `Unexpected response: status=${start.status} body=${start.text.slice(0, 220)}`,
    );
  }

  printResults();
  process.exit(failed ? 1 : 0);
}

function printResults() {
  console.log("\nLive Mailbox OAuth Verification");
  console.log(`Target: ${baseUrl}`);
  console.log("--------------------------------");
  for (const row of checks) {
    console.log(`[${row.level}] ${row.label}: ${row.details}`);
  }
}

main().catch((err) => {
  console.error("Verification script failed:", err?.message ?? err);
  process.exit(1);
});
