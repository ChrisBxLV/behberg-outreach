import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { assertContactScope } from "../_core/orgAccess";
import { requireTenantQueryScope } from "../_core/authz";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getContacts,
  getContactById,
  createOrMergeContact,
  updateContact,
  updateContactLinkedInUrl,
  deleteContacts,
  bulkUpdateContactStage,
  getImportBatches,
  getEmailLogsByContact,
  getContactFilterOptions,
  getEnrichmentResultsByContactId,
  replaceContactEnrichmentSnapshot,
  updateContactEnrichmentMeta,
} from "../db";
import { enrichContactMvp } from "../enrichment/enrichment.service";
import { validateLinkedInUrlForManualStorage } from "../enrichment/providers/manualLinkedIn.provider";

export const contactsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        stage: z.string().optional(),
        emailStatus: z.string().optional(),
        country: z.string().optional(),
        industry: z.string().optional(),
        keywords: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const scope =
        ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
          ? ({ type: "platform" } as const)
          : requireTenantQueryScope(ctx.user);
      return getContacts({ ...input, scope });
    }),

  filterOptions: protectedProcedure.query(async ({ ctx }) => {
    const scope =
      ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
        ? ({ type: "platform" } as const)
        : requireTenantQueryScope(ctx.user);
    return getContactFilterOptions(scope);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope =
        ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
          ? ({ type: "platform" } as const)
          : requireTenantQueryScope(ctx.user);
      const contact = await getContactById(input.id, scope);
      assertContactScope(contact, ctx.user);
      return contact!;
    }),

  enrichContact: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const scope =
        ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
          ? ({ type: "platform" } as const)
          : requireTenantQueryScope(ctx.user);

      const contact = await getContactById(input.contactId, scope);
      assertContactScope(contact, ctx.user);

      const orgId = contact.organizationId ?? null;
      if (!orgId) {
        // We need orgId for storing results and tenant scoping.
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required for enrichment." });
      }

      let fieldsCount = 0;
      try {
        await updateContactEnrichmentMeta(
          input.contactId,
          { enrichmentStatus: "enriching", enrichmentUpdatedAt: new Date() },
          scope,
        );

        const res = await enrichContactMvp({
          contactId: String(contact.id),
          orgId: String(orgId),
          email: contact.email ?? null,
          fullName: contact.fullName ?? null,
          companyName: contact.company ?? null,
          companyWebsite: contact.companyWebsite ?? null,
          linkedinUrl: contact.linkedinUrl ?? null,
        });

        const now = new Date();
        fieldsCount = res.fields.length;
        const enrichmentStatus: "enriched" | "no_data_found" =
          fieldsCount > 0 ? "enriched" : "no_data_found";
        await replaceContactEnrichmentSnapshot(
          orgId,
          contact.id,
          res.fields.map(f => ({
            source: f.source,
            fieldName: f.fieldName,
            fieldValue: f.fieldValue,
            confidence: f.confidence,
            personalData: f.personalData,
            rawData: f.rawData,
            collectedAt: now,
          })),
          {
            normalizedDomain: res.normalizedDomain ?? null,
            enrichmentUpdatedAt: now,
            enrichmentStatus,
          },
          scope,
        );

        return { success: true as const, fields: fieldsCount, enrichmentStatus };
      } catch (e: any) {
        await updateContactEnrichmentMeta(
          input.contactId,
          {
            enrichmentStatus: "failed",
            enrichmentUpdatedAt: new Date(),
          },
          scope,
        );
        return {
          success: false as const,
          fields: fieldsCount,
          error: String(e?.message ?? "enrichment_failed"),
        };
      }
    }),

  getContactEnrichmentResults: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope =
        ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
          ? ({ type: "platform" } as const)
          : requireTenantQueryScope(ctx.user);

      const contact = await getContactById(input.contactId, scope);
      assertContactScope(contact, ctx.user);

      return getEnrichmentResultsByContactId(input.contactId, scope);
    }),

  updateContactLinkedInUrl: protectedProcedure
    .input(z.object({ contactId: z.number(), linkedinUrl: z.string().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const scope =
        ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
          ? ({ type: "platform" } as const)
          : requireTenantQueryScope(ctx.user);

      const contact = await getContactById(input.contactId, scope);
      assertContactScope(contact, ctx.user);

      const normalized =
        input.linkedinUrl == null || input.linkedinUrl.trim() === ""
          ? null
          : validateLinkedInUrlForManualStorage(input.linkedinUrl);

      if (input.linkedinUrl && !normalized) {
        return { success: false as const, error: "LinkedIn URL must look like linkedin.com/in/... or linkedin.com/company/..." };
      }

      await updateContactLinkedInUrl(input.contactId, normalized, scope);
      return { success: true as const, linkedinUrl: normalized };
    }),

  create: protectedProcedure
    .input(
      z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        fullName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        title: z.string().optional(),
        company: z.string().optional(),
        industry: z.string().optional(),
        companySize: z.string().optional(),
        companyWebsite: z.string().optional(),
        linkedinUrl: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
        stage: z
          .enum(["new", "enriched", "in_sequence", "replied", "closed", "unsubscribed"])
          .default("new"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const fullName =
        input.fullName ??
        ([input.firstName, input.lastName].filter(Boolean).join(" ") || undefined);
      const orgId = dataScopeOrganizationId(ctx.user);
      await createOrMergeContact({
        ...input,
        fullName,
        organizationId: orgId ?? null,
      });
      return { success: true };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        fullName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        title: z.string().optional(),
        company: z.string().optional(),
        industry: z.string().optional(),
        companySize: z.string().optional(),
        companyWebsite: z.string().optional(),
        linkedinUrl: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
        stage: z
          .enum(["new", "enriched", "in_sequence", "replied", "closed", "unsubscribed"])
          .optional(),
        emailStatus: z.enum(["unknown", "valid", "invalid", "catch_all", "risky"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const scope =
        ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
          ? ({ type: "platform" } as const)
          : requireTenantQueryScope(ctx.user);
      const contact = await getContactById(id, scope);
      assertContactScope(contact, ctx.user);
      await updateContact(id, data, scope);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const scope =
        ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
          ? ({ type: "platform" } as const)
          : requireTenantQueryScope(ctx.user);
      await deleteContacts(input.ids, scope);
      return { success: true, deleted: input.ids.length };
    }),

  bulkUpdateStage: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.number()),
        stage: z.enum(["new", "enriched", "in_sequence", "replied", "closed", "unsubscribed"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const scope =
        ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
          ? ({ type: "platform" } as const)
          : requireTenantQueryScope(ctx.user);
      await bulkUpdateContactStage(input.ids, input.stage, scope);
      return { success: true };
    }),

  importBatches: protectedProcedure.query(async ({ ctx }) => {
    const scope =
      ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
        ? ({ type: "platform" } as const)
        : requireTenantQueryScope(ctx.user);
    return getImportBatches(scope);
  }),

  emailHistory: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope =
        ctx.user?.role === "superadmin" && !ctx.user.accountDisabled
          ? ({ type: "platform" } as const)
          : requireTenantQueryScope(ctx.user);
      const contact = await getContactById(input.contactId, scope);
      assertContactScope(contact, ctx.user);
      return getEmailLogsByContact(input.contactId);
    }),
});
