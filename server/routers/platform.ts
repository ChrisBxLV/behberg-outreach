import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { superadminProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { isFirebaseServerAuthConfigured } from "../_core/firebaseAdmin";
import { isActivePlatformSuperadmin, isDefaultEnvOperatorAccount } from "../_core/orgScope";
import {
  countActiveSuperadminUsersExcluding,
  createOrganizationRecord,
  deleteUserById,
  getOrganizationById,
  getPlatformOverview,
  getUserByEmail,
  getUserById,
  listOrganizationMembers,
  listUsersForPlatform,
  setOrganizationSubscriptionPlanId,
  updateOrganizationName,
  upsertUser,
} from "../db";
import { resolveDeployBuildInfo } from "../_core/deployBuildInfo";

const subscriptionPlanSchema = z.enum(["free", "basic", "business_standard", "pro"]);

export const platformRouter = router({
  overview: superadminProcedure.query(async () => getPlatformOverview()),

  /** Non-secret runtime flags (change via host env / redeploy). */
  runtimeInfo: superadminProcedure.query(async () => {
    const build = resolveDeployBuildInfo();
    return {
      nodeEnv: process.env.NODE_ENV ?? "development",
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
      devFileAuth: ENV.useDevFileAuth,
      authRequireEmailOtp: ENV.authRequireEmailOtp,
      disableScheduler: process.env.DISABLE_SCHEDULER === "true",
      disableSignalsScheduler: process.env.DISABLE_SIGNALS_SCHEDULER === "true",
      oauthServerConfigured: Boolean(ENV.oAuthServerUrl?.trim()),
      firebaseSignInServerConfigured: isFirebaseServerAuthConfigured(),
      defaultAdminLogin: ENV.defaultAdminLogin,
      appVersion: build.appVersion,
      gitCommitSha: build.gitCommitSha,
      gitCommitShortSha: build.gitCommitShortSha,
      gitBranch: build.gitBranch,
      buildTime: build.buildTime,
      serverStartedAt: build.serverStartedAt,
    };
  }),

  users: superadminProcedure.query(async () => listUsersForPlatform()),

  createOrganization: superadminProcedure
    .input(z.object({ name: z.string().trim().min(2).max(256) }))
    .mutation(async ({ input }) => {
      const id = await createOrganizationRecord(input.name);
      return { id } as const;
    }),

  updateOrganization: superadminProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        name: z.string().trim().min(2).max(256),
      }),
    )
    .mutation(async ({ input }) => {
      const org = await getOrganizationById(input.organizationId);
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }
      await updateOrganizationName(input.organizationId, input.name);
      return { success: true as const };
    }),

  organizationMembers: superadminProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const org = await getOrganizationById(input.organizationId);
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }
      return listOrganizationMembers(input.organizationId);
    }),

  setOrganizationSubscription: superadminProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        planId: subscriptionPlanSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const org = await getOrganizationById(input.organizationId);
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }
      await setOrganizationSubscriptionPlanId(input.organizationId, input.planId);
      return { success: true as const };
    }),

  assignUserWorkspace: superadminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        organizationId: z.number().int().positive().nullable(),
        orgMemberRole: z.enum(["owner", "member"]).nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      const target = await getUserById(input.userId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }
      if (input.organizationId == null) {
        await upsertUser({
          openId: target.openId,
          role: target.role,
          organizationId: null,
          orgMemberRole: null,
        });
        return { success: true as const };
      }
      const org = await getOrganizationById(input.organizationId);
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }
      const role = input.orgMemberRole;
      if (role == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose owner or member when assigning a workspace.",
        });
      }
      if (role === "owner") {
        const members = await listOrganizationMembers(input.organizationId);
        for (const m of members) {
          if (m.id === input.userId) continue;
          if (m.orgMemberRole !== "owner") continue;
          const other = await getUserById(m.id);
          if (other) await upsertUser({ openId: other.openId, role: other.role, orgMemberRole: "member" });
        }
      }
      await upsertUser({
        openId: target.openId,
        role: target.role,
        organizationId: input.organizationId,
        orgMemberRole: role,
      });
      return { success: true as const };
    }),

  grantSuperadmin: superadminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const target = await getUserById(input.userId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }
      if (target.accountDisabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot promote a disabled account.",
        });
      }
      await upsertUser({ openId: target.openId, role: "superadmin" });
      return { success: true as const };
    }),

  updateUser: superadminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        name: z.string().trim().max(200).optional(),
        email: z
          .string()
          .trim()
          .max(320)
          .optional()
          .refine(
            v => v == null || v.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
            "Invalid email.",
          ),
        role: z.enum(["user", "admin", "superadmin"]).optional(),
        accountDisabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const target = await getUserById(input.userId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      const nextRole = input.role ?? target.role;
      const nextDisabled = input.accountDisabled ?? target.accountDisabled;

      if (target.role === "superadmin" && nextRole !== "superadmin") {
        const others = await countActiveSuperadminUsersExcluding(target.id);
        if (others < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Keep at least one other active platform superadmin before changing this role.",
          });
        }
      }

      if (!target.accountDisabled && nextDisabled && nextRole === "superadmin") {
        const others = await countActiveSuperadminUsersExcluding(target.id);
        if (others < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Assign another superadmin before disabling this account.",
          });
        }
      }

      if (nextDisabled && isDefaultEnvOperatorAccount(target)) {
        const others = await countActiveSuperadminUsersExcluding(target.id);
        if (others < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Grant platform superadmin to another user before disabling the default operator account.",
          });
        }
      }

      let emailNorm: string | null | undefined;
      if (input.email !== undefined) {
        const raw = input.email.trim();
        if (raw.length === 0) {
          if (target.passwordHash && target.passwordSalt) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot clear email while this account uses password sign-in.",
            });
          }
          emailNorm = null;
        } else {
          emailNorm = raw.toLowerCase();
          const existing = await getUserByEmail(emailNorm);
          if (existing && existing.id !== target.id) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "That email is already used by another user.",
            });
          }
        }
      }

      const name =
        input.name === undefined ? undefined : input.name.length === 0 ? null : input.name;

      await upsertUser({
        openId: target.openId,
        role: nextRole,
        ...(name !== undefined ? { name } : {}),
        ...(emailNorm !== undefined ? { email: emailNorm } : {}),
        ...(input.accountDisabled !== undefined ? { accountDisabled: input.accountDisabled } : {}),
      });

      return { success: true as const };
    }),

  /**
   * Disables password (and all sign-in) for the seeded `DEFAULT_ADMIN_LOGIN` identity only,
   * after at least one other active `superadmin` exists.
   */
  disableSeededOperator: superadminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const target = await getUserById(input.userId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }
      if (!isDefaultEnvOperatorAccount(target)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only the default operator row (DEFAULT_ADMIN_LOGIN / matching email) can be disabled here.",
        });
      }
      const otherSuperadmins = await countActiveSuperadminUsersExcluding(input.userId);
      if (otherSuperadmins < 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Grant platform superadmin to at least one other user before disabling the default operator account.",
        });
      }
      await upsertUser({
        openId: target.openId,
        role: target.role,
        accountDisabled: true,
        passwordSalt: null,
        passwordHash: null,
      });
      return { success: true as const };
    }),

  deleteUser: superadminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      // `superadminProcedure` allows the default-operator-by-login (role still
      // "admin") into the platform console; deleting users is gated to the
      // strict `superadmin` role to avoid privilege creep before the role
      // migration has run for every operator account.
      if (!isActivePlatformSuperadmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin role required." });
      }
      if (ctx.user.id === input.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account." });
      }

      const target = await getUserById(input.userId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      if (target.role === "superadmin" && !target.accountDisabled) {
        const others = await countActiveSuperadminUsersExcluding(target.id);
        if (others < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Keep at least one other active platform superadmin before deleting this user.",
          });
        }
      }

      if (isDefaultEnvOperatorAccount(target) && !target.accountDisabled) {
        const others = await countActiveSuperadminUsersExcluding(target.id);
        if (others < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Assign another superadmin before deleting the default operator account.",
          });
        }
      }

      await deleteUserById(target.id);
      return { success: true as const };
    }),
});
