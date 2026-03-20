import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { randomInt } from "node:crypto";
import { hashOtp, hashPassword, makePasswordSalt, verifyPassword } from "./auth/password";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import {
  abandonLatestUnusedLoginChallenge,
  createLoginChallenge,
  createOrganizationRecord,
  getDb,
  getUserByEmail,
  upsertUser,
  verifyLoginChallenge,
} from "./db";
import { sendLoginCodeEmail } from "./services/emailService";
import { agentDebugLog } from "./_core/agentDebugLog";
import { contactsRouter } from "./routers/contacts";
import { campaignsRouter } from "./routers/campaigns";
import { emailRouter } from "./routers/email";
import { organizationRouter } from "./routers/organization";
import { settingsRouter } from "./routers/settings";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    loginOptions: publicProcedure.query(() => ({
      requireEmailOtp: ENV.authRequireEmailOtp,
    })),
    registerOrganization: publicProcedure
      .input(
        z.object({
          organizationName: z.string().trim().min(2).max(256),
          adminEmail: z
            .string()
            .trim()
            .email()
            .max(320)
            .transform(s => s.toLowerCase()),
          adminDisplayName: z.string().trim().min(1).max(200),
          password: z.string().min(8).max(256),
        }),
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db && !ENV.useDevFileAuth) {
          return { success: false as const, reason: "service_unavailable" as const };
        }
        const loginId = input.adminEmail.trim().toLowerCase();
        const existing = await getUserByEmail(loginId);
        if (existing) {
          return { success: false as const, reason: "email_taken" as const };
        }
        const orgId = await createOrganizationRecord(input.organizationName.trim());
        const salt = makePasswordSalt();
        const hash = hashPassword(input.password, salt);
        await upsertUser({
          openId: `login:${loginId}`,
          email: loginId,
          name: input.adminDisplayName,
          loginMethod: "password",
          role: "admin",
          organizationId: orgId,
          orgMemberRole: "owner",
          passwordSalt: salt,
          passwordHash: hash,
          lastSignedIn: new Date(),
        });
        return { success: true as const, organizationId: orgId };
      }),
    requestLoginCode: publicProcedure
      .input(
        z
          .union([
            z.object({
              loginId: z.string().trim().min(1).max(320),
              password: z.string().min(1),
            }),
            z.object({
              email: z.string().trim().min(1).max(320),
              password: z.string().min(1),
            }),
          ])
          .transform(x => ({
            loginId: ("loginId" in x ? x.loginId : x.email).trim().toLowerCase(),
            password: x.password,
          })),
      )
      .mutation(async ({ ctx, input }) => {
        const loginId = input.loginId;
        const password = input.password;
        const db = await getDb();
        if (!db && !ENV.useDevFileAuth) {
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H_DB",
            location: "server/routers.ts:requestLoginCode",
            message: "Database unavailable",
            data: {
              hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
              useDevFileAuth: ENV.useDevFileAuth,
            },
          });
          // #endregion
          return { success: false as const, reason: "service_unavailable" as const };
        }

        let user = await getUserByEmail(loginId);
        const onAllowlist = parseAllowlistLogins().has(loginId);
        const isOrgCredentialUser = Boolean(
          user &&
            user.organizationId != null &&
            user.passwordSalt &&
            user.passwordHash,
        );
        // #region agent log
        agentDebugLog({
          runId: "baseline",
          hypothesisId: "H3",
          location: "server/routers.ts:requestLoginCode-entry",
          message: "requestLoginCode entered",
          data: {
            allowed: onAllowlist,
            isOrgCredentialUser,
            loginIdLength: loginId.length,
            isMainAdminCandidate: loginId === ENV.defaultAdminLogin.toLowerCase(),
            requireOtp: ENV.authRequireEmailOtp,
          },
        });
        // #endregion

        if (!onAllowlist && !isOrgCredentialUser) {
          return { success: false as const, reason: "invalid_credentials" as const };
        }

        const openId = `login:${loginId}`;

        // Seed the default admin once (for dev convenience).
        if (!user && loginId === ENV.defaultAdminLogin.toLowerCase()) {
          if (password !== ENV.defaultAdminPassword) {
            return { success: false as const, reason: "invalid_credentials" as const };
          }
          const salt = makePasswordSalt();
          const hash = hashPassword(password, salt);
          await upsertUser({
            openId,
            email: loginId,
            name: loginId,
            loginMethod: ENV.authRequireEmailOtp ? "password_email_2fa" : "password",
            role: "admin",
            passwordSalt: salt,
            passwordHash: hash,
            lastSignedIn: new Date(),
          });
          user = await getUserByEmail(loginId);

          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H6",
            location: "server/routers.ts:seed-default-admin",
            message: "Default admin seeded",
            data: { seeded: Boolean(user) },
          });
          // #endregion
        }

        if (!user?.passwordSalt || !user?.passwordHash) {
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H7",
            location: "server/routers.ts:requestLoginCode-missing-password",
            message: "User missing password fields",
            data: { hasSalt: Boolean(user?.passwordSalt), hasHash: Boolean(user?.passwordHash) },
          });
          // #endregion
          return { success: false as const, reason: "invalid_credentials" as const };
        }

        const passwordOk = verifyPassword(password, user.passwordSalt, user.passwordHash);
        if (!passwordOk) {
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H8",
            location: "server/routers.ts:requestLoginCode-password-verify",
            message: "Password verification failed",
            data: { passwordOk: false },
          });
          // #endregion
          return { success: false as const, reason: "invalid_credentials" as const };
        }

        if (!ENV.authRequireEmailOtp) {
          await upsertUser({
            openId: user.openId,
            email: loginId,
            name: user.name ?? loginId,
            loginMethod: "password",
            role: "admin",
            // Preserve organization membership when a member signs in again.
            organizationId: user.organizationId ?? null,
            orgMemberRole: user.orgMemberRole ?? null,
            lastSignedIn: new Date(),
          });
          const refreshed = (await getUserByEmail(loginId)) ?? user;
          // #region agent log
          agentDebugLog({
            runId: "post-fix",
            hypothesisId: "H_ORG_PRESERVE",
            location: "server/routers.ts:requestLoginCode-session-direct-org-fields",
            message: "Upsert user during password sign-in (org fields preserved)",
            data: {
              beforeOrganizationId: user.organizationId ?? null,
              beforeOrgMemberRole: user.orgMemberRole ?? null,
            },
          });
          // #endregion
          let sessionToken: string;
          try {
            sessionToken = await sdk.createSessionToken(refreshed.openId, {
              name: refreshed.name ?? loginId,
            });
          } catch (err) {
            // #region agent log
            agentDebugLog({
              runId: "baseline",
              hypothesisId: "H_ERR",
              location: "server/routers.ts:requestLoginCode-session-token",
              message: "createSessionToken threw",
              data: {
                errName: err instanceof Error ? err.name : "unknown",
                errMsgLen: err instanceof Error ? err.message.length : 0,
              },
            });
            // #endregion
            throw err;
          }
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H5",
            location: "server/routers.ts:requestLoginCode-session-direct",
            message: "Session issued without email OTP",
            data: { loginIdLength: loginId.length },
          });
          // #endregion
          const cookieOptions = getSessionCookieOptions(ctx.req);
          // #region agent log
          agentDebugLog({
            runId: "post-fix",
            hypothesisId: "H_COOKIE",
            location: "server/routers.ts:requestLoginCode-set-cookie",
            message: "Setting session cookie options",
            data: {
              sameSite: cookieOptions.sameSite,
              secure: cookieOptions.secure,
            },
          });
          // #endregion
          ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
          return { success: true as const, requireOtp: false as const };
        }

        const otp = randomInt(100000, 1000000).toString();
        const otpHash = hashOtp(loginId, otp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const creation = await createLoginChallenge({
          email: loginId,
          codeHash: otpHash,
          expiresAt,
          requestIp: ctx.req.ip,
          cooldownSeconds: 60,
          maxAttempts: 5,
        });
        // #region agent log
        agentDebugLog({
          runId: "baseline",
          hypothesisId: "H4",
          location: "server/routers.ts:requestLoginCode-challenge",
          message: "Challenge creation result",
          data: { sent: creation.sent, retryAfterSeconds: creation.retryAfterSeconds },
        });
        // #endregion

        if (!creation.sent) {
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H_RATE",
            location: "server/routers.ts:requestLoginCode-rate-limit",
            message: "Cooldown active; no new code sent",
            data: { retryAfterSeconds: creation.retryAfterSeconds },
          });
          // #endregion
          return {
            success: false as const,
            reason: "rate_limited" as const,
            retryAfterSeconds: creation.retryAfterSeconds,
          };
        }

        const otpTo =
          loginId.includes("@") ? loginId : (ENV.otpDeliveryEmail || "").trim().toLowerCase();
        if (!otpTo) {
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H5",
            location: "server/routers.ts:requestLoginCode-otp-dest",
            message: "OTP enabled but no delivery address for non-email login",
            data: { loginIsEmail: loginId.includes("@") },
          });
          // #endregion
          return { success: false as const, reason: "otp_mail_not_configured" as const };
        }

        try {
          await sendLoginCodeEmail({
            toEmail: otpTo,
            code: otp,
            expiresInMinutes: 10,
            accountLoginHint: loginId,
          });
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H5",
            location: "server/routers.ts:requestLoginCode-email",
            message: "OTP email send succeeded",
            data: { expiresInMinutes: 10 },
          });
          // #endregion
        } catch (error) {
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H5",
            location: "server/routers.ts:requestLoginCode-email",
            message: "OTP email send failed",
            data: { errorName: error instanceof Error ? error.name : "unknown" },
          });
          // #endregion
          await abandonLatestUnusedLoginChallenge(loginId);
          throw error;
        }

        return { success: true as const, requireOtp: true as const };
      }),
    verifyLoginCode: publicProcedure
      .input(
        z
          .union([
            z.object({
              loginId: z.string().trim().min(1).max(320),
              code: z.string().regex(/^\d{6}$/),
            }),
            z.object({
              email: z.string().trim().min(1).max(320),
              code: z.string().regex(/^\d{6}$/),
            }),
          ])
          .transform(x => ({
            loginId: ("loginId" in x ? x.loginId : x.email).trim().toLowerCase(),
            code: x.code,
          })),
      )
      .mutation(async ({ ctx, input }) => {
        const loginId = input.loginId;
        const db = await getDb();
        if (!db && !ENV.useDevFileAuth) {
          // #region agent log
          agentDebugLog({
            runId: "baseline",
            hypothesisId: "H_DB",
            location: "server/routers.ts:verifyLoginCode",
            message: "Database unavailable",
            data: {
              hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
              useDevFileAuth: ENV.useDevFileAuth,
            },
          });
          // #endregion
          return { success: false as const, reason: "service_unavailable" as const };
        }

        const allowed = parseAllowlistLogins().has(loginId);
        // Org-created credentials should be able to verify OTP even if not on the admin allowlist.
        const existingUser = await getUserByEmail(loginId);
        const isOrgCredentialUser = Boolean(
          existingUser &&
            existingUser.organizationId != null &&
            existingUser.passwordSalt &&
            existingUser.passwordHash,
        );
        // #region agent log
        agentDebugLog({
          runId: "baseline",
          hypothesisId: "H3",
          location: "server/routers.ts:verifyLoginCode-entry",
          message: "verifyLoginCode entered",
          data: {
            allowed,
            isOrgCredentialUser,
            codeLength: input.code.length,
            isMainAdminCandidate: loginId === ENV.defaultAdminLogin.toLowerCase(),
          },
        });
        // #endregion
        if (!allowed && !isOrgCredentialUser) {
          return { success: false as const, reason: "invalid_code" as const };
        }

        const verification = await verifyLoginChallenge(loginId, hashOtp(loginId, input.code));
        // #region agent log
        agentDebugLog({
          runId: "baseline",
          hypothesisId: "H4",
          location: "server/routers.ts:verifyLoginCode-result",
          message: "verifyLoginChallenge result",
          data: { ok: verification.ok, reason: verification.ok ? "ok" : verification.reason },
        });
        // #endregion
        if (!verification.ok) {
          if (verification.reason === "expired") return { success: false as const, reason: "expired" as const };
          if (verification.reason === "too_many_attempts") {
            return { success: false as const, reason: "too_many_attempts" as const };
          }
          return { success: false as const, reason: "invalid_code" as const };
        }

        const openId = `login:${loginId}`;
        await upsertUser({
          openId: existingUser?.openId ?? openId,
          email: loginId,
          name: existingUser?.name ?? loginId,
          loginMethod: "password_email_2fa",
          role: "admin",
          // Preserve organization membership for email-OTP sign-ins.
          organizationId: existingUser?.organizationId ?? null,
          orgMemberRole: existingUser?.orgMemberRole ?? null,
          lastSignedIn: new Date(),
        });
        // #region agent log
        agentDebugLog({
          runId: "post-fix",
          hypothesisId: "H_ORG_PRESERVE",
          location: "server/routers.ts:verifyLoginCode-session-org-fields",
          message: "Upsert user during verifyLoginCode (org fields preserved)",
          data: {
            beforeOrganizationId: existingUser?.organizationId ?? null,
            beforeOrgMemberRole: existingUser?.orgMemberRole ?? null,
          },
        });
        // #endregion

        const sessionToken = await sdk.createSessionToken(existingUser?.openId ?? openId, {
          name: existingUser?.name ?? loginId,
        });
        // #region agent log
        agentDebugLog({
          runId: "baseline",
          hypothesisId: "H5",
          location: "server/routers.ts:verifyLoginCode-session",
          message: "Session token created",
          data: { hasExistingUser: Boolean(existingUser), loginMethod: "password_email_2fa" },
        });
        // #endregion
        const cookieOptions = getSessionCookieOptions(ctx.req);
        // #region agent log
        agentDebugLog({
          runId: "post-fix",
          hypothesisId: "H_COOKIE",
          location: "server/routers.ts:verifyLoginCode-set-cookie",
          message: "Setting session cookie options",
          data: {
            sameSite: cookieOptions.sameSite,
            secure: cookieOptions.secure,
          },
        });
        // #endregion
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  contacts: contactsRouter,
  campaigns: campaignsRouter,
  email: emailRouter,
  organization: organizationRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;

function parseAllowlistLogins() {
  const raw = ENV.adminAllowlist.trim();
  const explicit = raw ? raw.split(",").map(e => e.trim().toLowerCase()).filter(Boolean) : [];
  const logins = explicit.length ? explicit : [ENV.defaultAdminLogin.toLowerCase()];
  if (!logins.includes(ENV.defaultAdminLogin.toLowerCase())) logins.push(ENV.defaultAdminLogin.toLowerCase());
  return new Set(logins);
}
