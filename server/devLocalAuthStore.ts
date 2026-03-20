/**
 * Development-only persistence when DATABASE_URL is not set.
 * Stores admin users + login OTP challenges in .data/local-auth.json (gitignored via .data/).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InsertUser, User } from "../drizzle/schema";
import { ENV } from "./_core/env";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(REPO_ROOT, ".data");
const STORE_PATH = join(DATA_DIR, "local-auth.json");

type ChallengeRow = {
  id: number;
  email: string;
  codeHash: string;
  requestIp: string | null;
  expiresAt: string;
  attemptCount: number;
  maxAttempts: number;
  usedAt: string | null;
  createdAt: string;
};

type OrgRow = {
  id: number;
  name: string;
  createdAt: string;
};

type StoreFile = {
  organizations: OrgRow[];
  users: User[];
  challenges: ChallengeRow[];
  nextUserId: number;
  nextChallengeId: number;
  nextOrgId: number;
};

let queue = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function loadStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    return {
      organizations: parsed.organizations ?? [],
      users: parsed.users ?? [],
      challenges: parsed.challenges ?? [],
      nextUserId: parsed.nextUserId ?? 1,
      nextChallengeId: parsed.nextChallengeId ?? 1,
      nextOrgId: parsed.nextOrgId ?? 1,
    };
  } catch {
    return {
      organizations: [],
      users: [],
      challenges: [],
      nextUserId: 1,
      nextChallengeId: 1,
      nextOrgId: 1,
    };
  }
}

async function saveStore(store: StoreFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeUser(raw: User): User {
  const u = raw as User & {
    createdAt?: Date | string;
    updatedAt?: Date | string;
    lastSignedIn?: Date | string;
    organizationId?: number | null;
    orgMemberRole?: "owner" | "member" | null;
  };
  return {
    ...u,
    organizationId: u.organizationId ?? null,
    orgMemberRole: u.orgMemberRole ?? null,
    createdAt: u.createdAt instanceof Date ? u.createdAt : new Date(String(u.createdAt)),
    updatedAt: u.updatedAt instanceof Date ? u.updatedAt : new Date(String(u.updatedAt)),
    lastSignedIn:
      u.lastSignedIn instanceof Date ? u.lastSignedIn : new Date(String(u.lastSignedIn)),
  };
}

export async function devCreateOrganization(name: string): Promise<number> {
  return serialized(async () => {
    const store = await loadStore();
    const id = store.nextOrgId++;
    store.organizations.push({ id, name: name.trim(), createdAt: nowIso() });
    await saveStore(store);
    return id;
  });
}

export async function devGetOrganizationById(id: number) {
  return serialized(async () => {
    const store = await loadStore();
    return store.organizations.find(o => o.id === id) ?? null;
  });
}

export async function devListOrganizationMembers(organizationId: number) {
  return serialized(async () => {
    const store = await loadStore();
    return store.users
      .filter(u => (u.organizationId ?? null) === organizationId)
      .map(u => {
        const n = normalizeUser(u);
        return {
          id: n.id,
          email: n.email,
          name: n.name,
          orgMemberRole: n.orgMemberRole,
          lastSignedIn: n.lastSignedIn,
        };
      });
  });
}

export async function devGetUserByOpenId(openId: string): Promise<User | undefined> {
  return serialized(async () => {
    const store = await loadStore();
    const u = store.users.find(x => x.openId === openId);
    return u ? normalizeUser(u) : undefined;
  });
}

export async function devGetUserByEmail(email: string): Promise<User | undefined> {
  return serialized(async () => {
    const store = await loadStore();
    const e = email.trim().toLowerCase();
    const u = store.users.find(x => (x.email ?? "").toLowerCase() === e);
    return u ? normalizeUser(u) : undefined;
  });
}

export async function devUpsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  return serialized(async () => {
    const store = await loadStore();
    const idx = store.users.findIndex(u => u.openId === user.openId);
    const existing = idx >= 0 ? store.users[idx] : undefined;

    const existingNorm = existing ? normalizeUser(existing) : undefined;
    const resolvedRole: "user" | "admin" =
      user.role !== undefined
        ? user.role
        : user.openId === ENV.ownerOpenId
          ? "admin"
          : existingNorm?.role ?? "user";
    const merged: User = {
      id: existingNorm?.id ?? store.nextUserId++,
      openId: user.openId,
      name: user.name !== undefined ? user.name : existingNorm?.name ?? null,
      email: user.email !== undefined ? user.email : existingNorm?.email ?? null,
      loginMethod: user.loginMethod !== undefined ? user.loginMethod : existingNorm?.loginMethod ?? null,
      passwordSalt:
        user.passwordSalt !== undefined ? user.passwordSalt : existingNorm?.passwordSalt ?? null,
      passwordHash:
        user.passwordHash !== undefined ? user.passwordHash : existingNorm?.passwordHash ?? null,
      role: resolvedRole,
      organizationId:
        user.organizationId !== undefined
          ? user.organizationId
          : (existingNorm?.organizationId ?? null),
      orgMemberRole:
        user.orgMemberRole !== undefined
          ? user.orgMemberRole
          : (existingNorm?.orgMemberRole ?? null),
      createdAt: existingNorm?.createdAt ?? new Date(),
      updatedAt: new Date(),
      lastSignedIn:
        user.lastSignedIn !== undefined ? user.lastSignedIn : existingNorm?.lastSignedIn ?? new Date(),
    };

    if (idx >= 0) store.users[idx] = merged;
    else store.users.push(merged);
    await saveStore(store);
  });
}

type CreateChallengeInput = {
  email: string;
  codeHash: string;
  expiresAt: Date;
  requestIp?: string | null;
  cooldownSeconds?: number;
  maxAttempts?: number;
};

/** Remove the newest unused challenge for this login id (e.g. after OTP email send fails). */
export async function devAbandonLatestUnusedChallenge(email: string): Promise<void> {
  return serialized(async () => {
    const store = await loadStore();
    const e = email.trim().toLowerCase();
    const now = new Date();
    const candidates = store.challenges
      .filter(c => c.email === e && !c.usedAt && new Date(c.expiresAt) > now)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latest = candidates[0];
    if (!latest) return;
    store.challenges = store.challenges.filter(c => c.id !== latest.id);
    await saveStore(store);
  });
}

export async function devCreateLoginChallenge(
  input: CreateChallengeInput,
): Promise<{ sent: true; retryAfterSeconds: 0 } | { sent: false; retryAfterSeconds: number }> {
  return serialized(async () => {
    const store = await loadStore();
    const cooldownSeconds = input.cooldownSeconds ?? 60;
    const maxAttempts = input.maxAttempts ?? 5;
    const now = new Date();
    const email = input.email.trim().toLowerCase();

    const active = store.challenges
      .filter(c => c.email === email && !c.usedAt && new Date(c.expiresAt) > now)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (active?.createdAt) {
      const createdAtMs = new Date(active.createdAt).getTime();
      const retryAfterMs = createdAtMs + cooldownSeconds * 1000 - now.getTime();
      if (retryAfterMs > 0) {
        return { sent: false as const, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
      }
    }

    const row: ChallengeRow = {
      id: store.nextChallengeId++,
      email,
      codeHash: input.codeHash,
      requestIp: input.requestIp ?? null,
      expiresAt: input.expiresAt.toISOString(),
      attemptCount: 0,
      maxAttempts,
      usedAt: null,
      createdAt: nowIso(),
    };
    store.challenges.push(row);
    await saveStore(store);
    return { sent: true as const, retryAfterSeconds: 0 };
  });
}

export async function devVerifyLoginChallenge(
  email: string,
  submittedCodeHash: string,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" }> {
  return serialized(async () => {
    const store = await loadStore();
    const now = new Date();
    const e = email.trim().toLowerCase();

    const rows = store.challenges
      .filter(c => c.email === e && !c.usedAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const challenge = rows[0];
    if (!challenge) return { ok: false as const, reason: "invalid" as const };
    if (new Date(challenge.expiresAt) <= now) return { ok: false as const, reason: "expired" as const };
    if ((challenge.attemptCount ?? 0) >= challenge.maxAttempts) {
      return { ok: false as const, reason: "too_many_attempts" as const };
    }

    if (challenge.codeHash !== submittedCodeHash) {
      challenge.attemptCount += 1;
      await saveStore(store);
      return { ok: false as const, reason: "invalid" as const };
    }

    challenge.usedAt = nowIso();
    await saveStore(store);
    return { ok: true as const };
  });
}
