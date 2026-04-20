import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomInt } from "node:crypto";
import { hashPassword, makePasswordSalt } from "../auth/password";
import { orgOwnerProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  abandonLatestUnusedLoginChallenge,
  createOrganizationRecord,
  createLoginChallenge,
  getDb,
  getOrganizationById,
  getUserByEmail,
  getUserById,
  listOrganizationMembers,
  upsertUser,
} from "../db";
import { passwordResetChallengeKey } from "../auth/passwordResetChallenge";
import { hashOtp } from "../auth/password";
import { ENV } from "../_core/env";
import { sendPasswordResetEmail } from "../services/emailService";

export const organizationRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    const u = ctx.user;
    if (!u?.organizationId) {
      return { organization: null as null, role: null as null };
    }
    const org = await getOrganizationById(u.organizationId);
    return {
      organization: org ? { id: org.id, name: org.name, subscriptionPlanId: org.subscriptionPlanId } : null,
      role: u.orgMemberRole ?? null,
    };
  }),

  createMine: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(256) }))
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user;
      if (!u) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required." });
      if (u.organizationId != null) {
        throw new TRPCError({ code: "CONFLICT", message: "You already belong to an organization." });
      }
      const orgId = await createOrganizationRecord(input.name.trim());
      await upsertUser({
        openId: u.openId,
        email: u.email ?? undefined,
        name: u.name ?? undefined,
        loginMethod: u.loginMethod ?? undefined,
        role: u.role === "superadmin" ? "superadmin" : "admin",
        organizationId: orgId,
        orgMemberRole: "owner",
        lastSignedIn: new Date(),
      });
      return { success: true as const, organizationId: orgId };
    }),

  // Any authenticated org member can list org members.
  // Managing/adding members stays `orgOwnerProcedure`-protected.
  members: protectedProcedure.query(async ({ ctx }) => {
    const oid = ctx.user.organizationId;
    if (oid == null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No organization" });
    }
    return listOrganizationMembers(oid);
  }),

  addMember: orgOwnerProcedure
    .input(
      z.object({
        loginId: z
          .string()
          .trim()
          .min(1)
          .max(320)
          .transform(s => s.toLowerCase()),
        displayName: z.string().trim().min(1).max(200),
        password: z.string().min(8).max(256),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      if (orgId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No organization" });
      }
      const existing = await getUserByEmail(input.loginId);
      if (existing) {
        return { success: false as const, reason: "login_taken" as const };
      }
      const salt = makePasswordSalt();
      const hash = hashPassword(input.password, salt);
      await upsertUser({
        openId: `login:${input.loginId}`,
        email: input.loginId,
        name: input.displayName,
        loginMethod: "password",
        role: "user",
        organizationId: orgId,
        orgMemberRole: "member",
        passwordSalt: salt,
        passwordHash: hash,
        lastSignedIn: new Date(),
      });
      return { success: true as const };
    }),

  requestPasswordResetSelf: protectedProcedure
    .mutation(async ({ ctx }) => {
      const u = ctx.user;
      const db = await getDb();
      if (!db && !ENV.useDevFileAuth) {
        return { success: false as const, reason: "service_unavailable" as const };
      }
      if (!u?.email) {
        return { success: true as const, emailed: false as const };
      }
      const loginId = u.email.trim().toLowerCase();
      const user = await getUserByEmail(loginId);
      const canReset = Boolean(
        user && !user.accountDisabled && user.passwordSalt && user.passwordHash,
      );
      if (!canReset) return { success: true as const, emailed: false as const };

      const challengeEmail = passwordResetChallengeKey(loginId);
      const otp = randomInt(100000, 1000000).toString();
      const otpHash = hashOtp(loginId, otp);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const creation = await createLoginChallenge({
        email: challengeEmail,
        codeHash: otpHash,
        expiresAt,
        requestIp: ctx.req.ip,
        cooldownSeconds: 60,
        maxAttempts: 5,
      });
      if (!creation.sent) {
        return {
          success: false as const,
          reason: "rate_limited" as const,
          retryAfterSeconds: creation.retryAfterSeconds,
        };
      }

      const otpTo =
        loginId.includes("@") ? loginId : (ENV.otpDeliveryEmail || "").trim().toLowerCase();
      if (!otpTo) {
        await abandonLatestUnusedLoginChallenge(challengeEmail);
        return { success: false as const, reason: "delivery_not_configured" as const };
      }
      try {
        await sendPasswordResetEmail({
          toEmail: otpTo,
          code: otp,
          expiresInMinutes: 15,
          accountLoginHint: loginId,
        });
      } catch {
        await abandonLatestUnusedLoginChallenge(challengeEmail);
        return { success: false as const, reason: "mail_send_failed" as const };
      }
      return { success: true as const, emailed: true as const };
    }),

  requestPasswordResetMember: orgOwnerProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      if (orgId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "No organization" });

      const db = await getDb();
      if (!db && !ENV.useDevFileAuth) {
        return { success: false as const, reason: "service_unavailable" as const };
      }

      const target = await getUserById(input.userId);
      if (!target || (target.organizationId ?? null) !== orgId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      const loginId = (target.email ?? "").trim().toLowerCase();
      if (!loginId) {
        return { success: true as const, emailed: false as const };
      }
      const canReset = Boolean(
        !target.accountDisabled && target.passwordSalt && target.passwordHash,
      );
      if (!canReset) return { success: true as const, emailed: false as const };

      const challengeEmail = passwordResetChallengeKey(loginId);
      const otp = randomInt(100000, 1000000).toString();
      const otpHash = hashOtp(loginId, otp);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const creation = await createLoginChallenge({
        email: challengeEmail,
        codeHash: otpHash,
        expiresAt,
        requestIp: ctx.req.ip,
        cooldownSeconds: 60,
        maxAttempts: 5,
      });
      if (!creation.sent) {
        return {
          success: false as const,
          reason: "rate_limited" as const,
          retryAfterSeconds: creation.retryAfterSeconds,
        };
      }

      const otpTo =
        loginId.includes("@") ? loginId : (ENV.otpDeliveryEmail || "").trim().toLowerCase();
      if (!otpTo) {
        await abandonLatestUnusedLoginChallenge(challengeEmail);
        return { success: false as const, reason: "delivery_not_configured" as const };
      }
      try {
        await sendPasswordResetEmail({
          toEmail: otpTo,
          code: otp,
          expiresInMinutes: 15,
          accountLoginHint: loginId,
        });
      } catch {
        await abandonLatestUnusedLoginChallenge(challengeEmail);
        return { success: false as const, reason: "mail_send_failed" as const };
      }
      return { success: true as const, emailed: true as const };
    }),

  updateMember: orgOwnerProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        name: z.string().trim().min(1).max(200).optional(),
        orgMemberRole: z.enum(["owner", "member"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      if (orgId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "No organization" });

      const target = await getUserById(input.userId);
      if (!target || (target.organizationId ?? null) !== orgId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const nextRole = input.orgMemberRole ?? (target.orgMemberRole ?? "member");
      if (nextRole === "owner") {
        // Ensure only one owner: demote other owners in this org.
        const members = await listOrganizationMembers(orgId);
        for (const m of members) {
          if (m.id === input.userId) continue;
          if (m.orgMemberRole !== "owner") continue;
          const other = await getUserById(m.id);
          if (other) {
            await upsertUser({ openId: other.openId, role: other.role, orgMemberRole: "member" });
          }
        }
      }

      await upsertUser({
        openId: target.openId,
        role: target.role,
        name: input.name ?? target.name ?? undefined,
        orgMemberRole: nextRole,
      });
      return { success: true as const };
    }),

  removeMember: orgOwnerProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      if (orgId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "No organization" });
      if (ctx.user.id === input.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot remove yourself." });
      }

      const target = await getUserById(input.userId);
      if (!target || (target.organizationId ?? null) !== orgId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      if (target.orgMemberRole === "owner") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Transfer ownership before removing the owner." });
      }

      await upsertUser({
        openId: target.openId,
        role: target.role,
        organizationId: null,
        orgMemberRole: null,
      });
      return { success: true as const };
    }),
});
