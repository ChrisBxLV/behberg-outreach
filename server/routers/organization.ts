import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hashPassword, makePasswordSalt } from "../auth/password";
import { orgOwnerProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  getOrganizationById,
  getUserByEmail,
  listOrganizationMembers,
  upsertUser,
} from "../db";

export const organizationRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    const u = ctx.user;
    if (!u?.organizationId) {
      return { organization: null as null, role: null as null };
    }
    const org = await getOrganizationById(u.organizationId);
    return {
      organization: org ? { id: org.id, name: org.name } : null,
      role: u.orgMemberRole ?? null,
    };
  }),

  members: orgOwnerProcedure.query(async ({ ctx }) => {
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
        role: "admin",
        organizationId: orgId,
        orgMemberRole: "member",
        passwordSalt: salt,
        passwordHash: hash,
        lastSignedIn: new Date(),
      });
      return { success: true as const };
    }),
});
