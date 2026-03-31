import { z } from "zod";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { assertContactScope } from "../_core/orgAccess";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContacts,
  bulkUpdateContactStage,
  getImportBatches,
  getEmailLogsByContact,
  getContactFilterOptions,
} from "../db";

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
      const scope = dataScopeOrganizationId(ctx.user);
      return getContacts({ ...input, scopeOrganizationId: scope });
    }),

  filterOptions: protectedProcedure.query(async ({ ctx }) => {
    const scope = dataScopeOrganizationId(ctx.user);
    return getContactFilterOptions(scope);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const contact = await getContactById(input.id, scope);
      assertContactScope(contact, ctx.user);
      return contact!;
    }),

  create: protectedProcedure
    .input(
      z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        fullName: z.string().optional(),
        email: z.string().email().optional(),
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
      await createContact({
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
      const scope = dataScopeOrganizationId(ctx.user);
      const contact = await getContactById(id, scope);
      assertContactScope(contact, ctx.user);
      await updateContact(id, data, scope);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
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
      const scope = dataScopeOrganizationId(ctx.user);
      await bulkUpdateContactStage(input.ids, input.stage, scope);
      return { success: true };
    }),

  importBatches: protectedProcedure.query(async () => {
    return getImportBatches();
  }),

  emailHistory: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const contact = await getContactById(input.contactId, scope);
      assertContactScope(contact, ctx.user);
      return getEmailLogsByContact(input.contactId);
    }),
});
