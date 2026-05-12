import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { requirePermission } from "./authz";
import { isRateLimitTestEnv, rateLimitConfig } from "./rateLimit";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * In-memory fixed-window rate limiter for tRPC procedures, keyed by remote IP +
 * a label. Mirrors the Express limiters in `rateLimit.ts` so auth-level abuse
 * (login code / password reset spam) is bounded even though tRPC doesn't go
 * through `express-rate-limit` middleware. Per-process state is acceptable for
 * sensitive low-frequency endpoints; a multi-instance deployment can move this
 * to Redis later without API changes.
 *
 * Memory safety: each unique `${label}:${ip}` creates one bucket. Entries are
 * only refreshed when the *same* IP returns, so without cleanup, traffic from
 * many one-shot IPs would grow this map without bound. We bound it two ways
 * (both run inline on writes — no background timer to leak across restarts):
 *  1. When the map crosses `TRPC_RATE_LIMIT_MAX_BUCKETS`, sweep expired
 *     entries (their windows have already elapsed, so dropping them changes
 *     nothing semantically — the next request would re-create them anyway).
 *  2. If the map is *still* over the cap after sweeping (sustained burst from
 *     many distinct live IPs), evict the entries closest to expiry until we
 *     drop back to the cap. This is the LRU-ish safety net that keeps memory
 *     bounded under adversarial traffic.
 */
const trpcRateBuckets = new Map<string, { count: number; resetAt: number }>();
const TRPC_RATE_LIMIT_MAX_BUCKETS = 1000;

function pruneTrpcRateBuckets(now: number): void {
  trpcRateBuckets.forEach((entry, key) => {
    if (entry.resetAt <= now) {
      trpcRateBuckets.delete(key);
    }
  });
  if (trpcRateBuckets.size > TRPC_RATE_LIMIT_MAX_BUCKETS) {
    const sortedByResetAt = Array.from(trpcRateBuckets.entries()).sort(
      (a, b) => a[1].resetAt - b[1].resetAt,
    );
    const toEvict = trpcRateBuckets.size - TRPC_RATE_LIMIT_MAX_BUCKETS;
    for (let i = 0; i < toEvict; i++) {
      trpcRateBuckets.delete(sortedByResetAt[i]![0]);
    }
  }
}

export function makeTrpcRateLimit(opts: { max: number; windowMs: number; label: string }) {
  return t.middleware(async ({ ctx, next }) => {
    if (isRateLimitTestEnv()) return next();
    const ip = String(ctx.req?.ip ?? "unknown");
    const key = `${opts.label}:${ip}`;
    const now = Date.now();
    if (trpcRateBuckets.size > TRPC_RATE_LIMIT_MAX_BUCKETS) {
      pruneTrpcRateBuckets(now);
    }
    let entry = trpcRateBuckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      trpcRateBuckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > opts.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many attempts. Please try again in ~${retryAfterSeconds}s.`,
      });
    }
    return next();
  });
}

export const authCodeRateLimit = makeTrpcRateLimit({
  ...rateLimitConfig.authCode,
  label: "auth-code",
});

export const passwordResetRateLimit = makeTrpcRateLimit({
  ...rateLimitConfig.passwordReset,
  label: "password-reset",
});

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    try {
      requirePermission(ctx.user, "system.notifyOwner");
    } catch {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/** Behberg platform operator only (cross-tenant). */
export const superadminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    try {
      requirePermission(ctx.user, "platform.console");
    } catch {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Platform superadmin access required.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/** Organization owner only (manage members, etc.). */
export const orgOwnerProcedure = protectedProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    try {
      requirePermission(ctx.user, "org.ownerAction");
    } catch {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the organization owner can do this.",
      });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user!,
      },
    });
  }),
);
