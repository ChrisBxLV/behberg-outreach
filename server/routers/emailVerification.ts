import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buildEmailVerificationFromLinkedIn,
  generateEmailCandidates,
  resolveCompanyDomainFromProfile,
  verifyEmailLegitimacy,
} from "../services/emailVerificationTool";

export const emailVerificationRouter = router({
  resolveDomain: protectedProcedure
    .input(
      z.object({
        companyName: z.string().trim().min(1).max(256),
        companyWebsite: z.string().trim().max(512).optional(),
        companyDomainHint: z.string().trim().max(320).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return resolveCompanyDomainFromProfile(input);
    }),

  generateCandidates: protectedProcedure
    .input(
      z.object({
        fullName: z.string().trim().min(1).max(200),
        domain: z.string().trim().min(1).max(320),
        limit: z.number().int().min(1).max(12).default(6),
      }),
    )
    .mutation(async ({ input }) => {
      const candidates = generateEmailCandidates(input);
      return { candidates };
    }),

  verifyCandidates: protectedProcedure
    .input(
      z.object({
        emails: z.array(z.string().trim().min(3).max(320)).min(1).max(20),
      }),
    )
    .mutation(async ({ input }) => {
      const verifications = await Promise.all(input.emails.map(email => verifyEmailLegitimacy(email)));
      return { verifications };
    }),

  buildFromLinkedIn: protectedProcedure
    .input(
      z.object({
        fullName: z.string().trim().min(1).max(200),
        companyName: z.string().trim().min(1).max(256),
        linkedinUrl: z.string().trim().max(1_024).optional(),
        companyWebsite: z.string().trim().max(512).optional(),
        companyDomainHint: z.string().trim().max(320).optional(),
        maxCandidates: z.number().int().min(1).max(12).default(6),
      }),
    )
    .mutation(async ({ input }) => {
      return buildEmailVerificationFromLinkedIn(input);
    }),
});
