import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { protectedProcedure, router } from "../_core/trpc";
import {
  startProspectingV1Run,
  getProspectingV1Status,
  importProspectingV1Selected,
} from "../services/prospectingV1Service";

export const prospectingRouter = router({
  runV1: protectedProcedure
    .input(
      z.object({
        industry: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(120),
        country: z.string().trim().max(120).optional(),
        /** Optional: one company per line in UI. */
        companies: z.array(z.string().trim().min(1).max(256)).max(50).default([]),
        maxCompanies: z.number().int().min(1).max(20).default(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const runId = await startProspectingV1Run({
        organizationId: orgId,
        industry: input.industry,
        title: input.title,
        country: input.country,
        companies: input.companies,
        maxCompanies: input.maxCompanies,
      });
      return { runId } as const;
    }),

  statusV1: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const s = getProspectingV1Status(input.runId);
      if (!s || s.organizationId !== orgId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      }
      return s;
    }),

  importSelectedV1: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        candidateIds: z.array(z.string().min(1).max(64)).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const imported = await importProspectingV1Selected({
        organizationId: orgId,
        runId: input.runId,
        candidateIds: input.candidateIds,
      });
      return { success: true, imported } as const;
    }),
});

