import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getContacts, getContactById, createContact, updateContact,
  deleteContacts, bulkUpdateContactStage, getImportBatches, getEmailLogsByContact,
} from "../db";

export const contactsRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      stage: z.string().optional(),
      emailStatus: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return getContacts(input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const contact = await getContactById(input.id);
      if (!contact) throw new Error("Contact not found");
      return contact;
    }),

  create: protectedProcedure
    .input(z.object({
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
      stage: z.enum(["new", "enriched", "in_sequence", "replied", "closed", "unsubscribed"]).default("new"),
    }))
    .mutation(async ({ input }) => {
      const fullName = input.fullName ?? ([input.firstName, input.lastName].filter(Boolean).join(" ") || undefined);
      await createContact({ ...input, fullName });
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
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
      stage: z.enum(["new", "enriched", "in_sequence", "replied", "closed", "unsubscribed"]).optional(),
      emailStatus: z.enum(["unknown", "valid", "invalid", "catch_all", "risky"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateContact(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await deleteContacts(input.ids);
      return { success: true, deleted: input.ids.length };
    }),

  bulkUpdateStage: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      stage: z.enum(["new", "enriched", "in_sequence", "replied", "closed", "unsubscribed"]),
    }))
    .mutation(async ({ input }) => {
      await bulkUpdateContactStage(input.ids, input.stage);
      return { success: true };
    }),

  importBatches: protectedProcedure
    .query(async () => {
      return getImportBatches();
    }),

  emailHistory: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      return getEmailLogsByContact(input.contactId);
    }),
});
