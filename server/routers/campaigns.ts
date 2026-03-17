import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getCampaigns, getCampaignById, createCampaign, updateCampaign, deleteCampaign,
  getSequenceSteps, upsertSequenceStep, deleteSequenceStep, deleteSequenceStepsByCampaign,
  getCampaignContacts, enrollContactsInCampaign, updateCampaignContact,
  getEmailLogsByCampaign, markEmailReplied,
} from "../db";
import { launchCampaign, processEmailQueue } from "../services/sequenceScheduler";

export const campaignsRouter = router({
  list: protectedProcedure.query(async () => {
    return getCampaigns();
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const campaign = await getCampaignById(input.id);
      if (!campaign) throw new Error("Campaign not found");
      const steps = await getSequenceSteps(input.id);
      return { ...campaign, steps };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      fromName: z.string().optional(),
      fromEmail: z.string().email().optional(),
      replyTo: z.string().email().optional(),
    }))
    .mutation(async ({ input }) => {
      await createCampaign({
        name: input.name,
        description: input.description,
        fromName: input.fromName ?? "Behberg",
        fromEmail: input.fromEmail ?? "outreach@behberg.com",
        replyTo: input.replyTo,
        status: "draft",
      });
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      fromName: z.string().optional(),
      fromEmail: z.string().email().optional(),
      replyTo: z.string().email().optional(),
      status: z.enum(["draft", "active", "paused", "completed"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateCampaign(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteSequenceStepsByCampaign(input.id);
      await deleteCampaign(input.id);
      return { success: true };
    }),

  // Sequence steps
  saveSteps: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      steps: z.array(z.object({
        id: z.number().optional(),
        stepOrder: z.number(),
        stepType: z.enum(["initial", "follow_up", "last_notice", "opened_no_reply"]),
        subject: z.string().min(1),
        bodyTemplate: z.string().min(1),
        delayDays: z.number().min(0).default(0),
        delayHours: z.number().min(0).default(0),
        condition: z.enum(["always", "not_opened", "opened_no_reply", "not_replied"]).default("always"),
        useLlmPersonalization: z.boolean().default(false),
      })),
    }))
    .mutation(async ({ input }) => {
      // Delete existing and recreate
      await deleteSequenceStepsByCampaign(input.campaignId);
      for (const step of input.steps) {
        await upsertSequenceStep({
          campaignId: input.campaignId,
          stepOrder: step.stepOrder,
          stepType: step.stepType,
          subject: step.subject,
          bodyTemplate: step.bodyTemplate,
          delayDays: step.delayDays,
          delayHours: step.delayHours,
          condition: step.condition,
          useLlmPersonalization: step.useLlmPersonalization,
        });
      }
      return { success: true };
    }),

  // Contacts in campaign
  contacts: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      return getCampaignContacts(input.campaignId);
    }),

  enroll: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      contactIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      await enrollContactsInCampaign(input.campaignId, input.contactIds);
      return { success: true, enrolled: input.contactIds.length };
    }),

  launch: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      contactIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const campaign = await getCampaignById(input.campaignId);
      if (!campaign) throw new Error("Campaign not found");

      let contactIds = input.contactIds ?? [];
      if (!contactIds.length) {
        const enrolled = await getCampaignContacts(input.campaignId);
        contactIds = enrolled.map(e => e.contact.id);
      }

      if (!contactIds.length) throw new Error("No contacts to launch campaign for");

      await launchCampaign(input.campaignId, contactIds);
      return { success: true, contactCount: contactIds.length };
    }),

  pause: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }) => {
      await updateCampaign(input.campaignId, { status: "paused" });
      return { success: true };
    }),

  resume: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }) => {
      await updateCampaign(input.campaignId, { status: "active" });
      return { success: true };
    }),

  // Email logs for campaign
  emailLogs: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      return getEmailLogsByCampaign(input.campaignId);
    }),

  markReplied: protectedProcedure
    .input(z.object({ emailLogId: z.number() }))
    .mutation(async ({ input }) => {
      await markEmailReplied(input.emailLogId);
      return { success: true };
    }),

  // Manual trigger for scheduler (for testing)
  processQueue: protectedProcedure
    .mutation(async () => {
      const result = await processEmailQueue();
      return result;
    }),

  updateContactStatus: protectedProcedure
    .input(z.object({
      campaignContactId: z.number(),
      status: z.enum(["enrolled", "active", "completed", "unsubscribed", "bounced", "replied"]),
    }))
    .mutation(async ({ input }) => {
      await updateCampaignContact(input.campaignContactId, { status: input.status });
      return { success: true };
    }),
});
