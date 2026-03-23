import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getSignalProfile,
  listSignalFacets,
  resetSignalsForOrganization,
  upsertSignalProfile,
} from "../db";
import {
  BUSINESS_TYPES,
  INDUSTRY_TAGS,
  SIGNAL_TYPES,
} from "../services/signalsCatalog";
import { getSignalsForOrganization, refreshSignalsForOrganization } from "../services/signalsService";

export const signalsRouter = router({
  taxonomy: protectedProcedure.query(() => ({
    businessTypes: BUSINESS_TYPES,
    industryTags: [...INDUSTRY_TAGS],
    signalTypes: [...SIGNAL_TYPES],
    sourceOptions: [
      "google_news_business",
      "google_news_technology",
      "reuters_business",
      "ycombinator_hn",
    ],
  })),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const orgId = dataScopeOrganizationId(ctx.user);
    if (orgId == null) return null;
    return (await getSignalProfile(orgId)) ?? null;
  }),

  saveProfile: protectedProcedure
    .input(
      z.object({
        businessType: z.string().min(1),
        selectedTags: z.array(z.string()).max(200),
        selectedSignalTypes: z.array(z.string()).max(30),
        sourcesEnabled: z.array(z.string()).max(20).optional(),
        refreshCadenceMinutes: z.number().int().min(15).max(24 * 60).default(30),
        isEnabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Signals are available only for organization workspaces.",
        });
      }
      if (input.selectedTags.length === 0 || input.selectedSignalTypes.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select at least one industry tag and one signal type to enable Signals.",
        });
      }
      await upsertSignalProfile(orgId, {
        businessType: input.businessType,
        selectedTags: input.selectedTags,
        selectedSignalTypes: input.selectedSignalTypes,
        sourcesEnabled: input.sourcesEnabled ?? [],
        refreshCadenceMinutes: input.refreshCadenceMinutes,
        isEnabled: input.isEnabled,
      });
      return { success: true } as const;
    }),

  listSignals: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(40),
        offset: z.number().int().min(0).default(0),
        search: z.string().optional(),
        source: z.string().optional(),
        tag: z.string().optional(),
        signalType: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) return { items: [], total: 0 };
      return getSignalsForOrganization({ organizationId: orgId, ...input });
    }),

  listFacets: protectedProcedure.query(async ({ ctx }) => {
    const orgId = dataScopeOrganizationId(ctx.user);
    if (orgId == null) return { sources: [], signalTypes: [], tags: [] };
    return listSignalFacets(orgId);
  }),

  triggerRefresh: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const profile = await getSignalProfile(orgId);
      if (!profile?.isEnabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Signals setup is not enabled yet.",
        });
      }
      if ((profile.selectedTags?.length ?? 0) === 0 || (profile.selectedSignalTypes?.length ?? 0) === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Complete setup with at least one industry tag and one signal type first.",
        });
      }
      return refreshSignalsForOrganization(orgId);
    }),

  resetFeed: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      await resetSignalsForOrganization(orgId);
      return { success: true } as const;
    }),
});
