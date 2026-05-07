// Email pattern waterfall (MX-only).
//
// Given an employee row, we generate candidate emails using the requested
// fixed waterfall, then verify the company's domain MX once and cache the
// result. We never fall back to SMTP RCPT TO probing — by design.
//
// Persists the chosen pattern back to `prospect_email_patterns` so future
// runs in the same company learn from observed/locked patterns.

import { resolveMx } from "node:dns/promises";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { prospectEmployees } from "../../../drizzle/schema";
import {
  bumpEmailPattern,
  getCompanyById,
  getTopEmailPattern,
  setEmployeeEmail,
} from "./repository";

const MX_CACHE = new Map<string, { ok: boolean; expiresAt: number }>();
const MX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const PATTERN_ORDER = [
  "first.last",
  "first",
  "firstlast",
  "f.last",
  "first.l",
  "flast",
  "first-last",
  "first_last",
  "last.first",
  "last",
  "lastf",
] as const;

type PatternCode = (typeof PATTERN_ORDER)[number];

function buildLocal(pattern: PatternCode, first: string, last: string): string | null {
  const f = first.toLowerCase().replace(/[^a-z]/g, "");
  const l = last.toLowerCase().replace(/[^a-z]/g, "");
  switch (pattern) {
    case "first.last":
      return f && l ? `${f}.${l}` : null;
    case "first":
      return f ? `${f}` : null;
    case "firstlast":
      return f && l ? `${f}${l}` : null;
    case "f.last":
      return f && l ? `${f.slice(0, 1)}.${l}` : null;
    case "first.l":
      return f && l ? `${f}.${l.slice(0, 1)}` : null;
    case "flast":
      return f && l ? `${f.slice(0, 1)}${l}` : null;
    case "first-last":
      return f && l ? `${f}-${l}` : null;
    case "first_last":
      return f && l ? `${f}_${l}` : null;
    case "last.first":
      return f && l ? `${l}.${f}` : null;
    case "last":
      return l ? `${l}` : null;
    case "lastf":
      return f && l ? `${l}${f.slice(0, 1)}` : null;
    default:
      return null;
  }
}

function isValidLocalPart(local: string): boolean {
  if (!local) return false;
  if (local.length < 2 || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (local.includes("..")) return false;
  return /^[a-z0-9._%+-]+$/.test(local);
}

async function checkMx(domain: string): Promise<boolean> {
  const cached = MX_CACHE.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.ok;
  try {
    const mx = await resolveMx(domain);
    const ok = Array.isArray(mx) && mx.length > 0;
    MX_CACHE.set(domain, { ok, expiresAt: Date.now() + MX_CACHE_TTL_MS });
    return ok;
  } catch {
    MX_CACHE.set(domain, { ok: false, expiresAt: Date.now() + MX_CACHE_TTL_MS });
    return false;
  }
}

export async function runEmailWaterfall(employeeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select()
    .from(prospectEmployees)
    .where(eq(prospectEmployees.id, employeeId));
  const employee = rows[0];
  if (!employee) return;

  const company = await getCompanyById(employee.companyId);
  if (!company || !company.domain) {
    await setEmployeeEmail(employeeId, {
      email: null,
      emailPattern: null,
      emailStatus: "unknown",
      emailGuesses: [],
    });
    return;
  }

  const first = (employee.firstName ?? deriveFirst(employee.fullName) ?? "").trim();
  const last = (employee.lastName ?? deriveLast(employee.fullName) ?? "").trim();
  if (!first && !last) {
    await setEmployeeEmail(employeeId, {
      email: null,
      emailPattern: null,
      emailStatus: "excluded",
      emailGuesses: [],
    });
    return;
  }

  // Move learned pattern to position 1 if available.
  const learned = await getTopEmailPattern(company.id);
  const orderedPatterns: PatternCode[] = [
    ...(learned && (PATTERN_ORDER as readonly string[]).includes(learned)
      ? [learned as PatternCode]
      : []),
    ...PATTERN_ORDER.filter(p => p !== learned),
  ];

  const guesses: Array<{ email: string; pattern: PatternCode }> = [];
  const seen = new Set<string>();
  for (const pattern of orderedPatterns) {
    const local = buildLocal(pattern, first, last);
    if (!local) continue;
    if (!isValidLocalPart(local)) continue;
    const email = `${local}@${company.domain}`;
    if (seen.has(email)) continue;
    seen.add(email);
    guesses.push({ email, pattern });
  }

  if (guesses.length === 0) {
    await setEmployeeEmail(employeeId, {
      email: null,
      emailPattern: null,
      emailStatus: "excluded",
      emailGuesses: [],
    });
    return;
  }

  const mxOk = await checkMx(company.domain);
  if (!mxOk) {
    await setEmployeeEmail(employeeId, {
      email: null,
      emailPattern: null,
      emailStatus: "mx_absent",
      emailGuesses: guesses.map(g => g.email),
    });
    return;
  }

  const top = guesses[0]!;
  await setEmployeeEmail(employeeId, {
    email: top.email,
    emailPattern: top.pattern,
    emailStatus: "mx_present",
    emailGuesses: guesses.map(g => g.email),
  });
  // Reinforce the chosen pattern so subsequent waterfalls in this company
  // converge on the same local-part shape.
  await bumpEmailPattern(company.id, top.pattern);
}

function deriveFirst(fullName: string): string {
  const parts = fullName.split(/\s+/g).filter(Boolean);
  return parts[0] ?? "";
}

function deriveLast(fullName: string): string {
  const parts = fullName.split(/\s+/g).filter(Boolean);
  if (parts.length < 2) return "";
  return parts[parts.length - 1] ?? "";
}
