import { z } from "zod";
import { assertCampaignScope, assertContactScope } from "../_core/orgAccess";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { protectedProcedure, router } from "../_core/trpc";
import { agentDebugLog } from "../_core/agentDebugLog";
import {
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getSequenceSteps,
  upsertSequenceStep,
  deleteSequenceStepsByCampaign,
  getCampaignContacts,
  enrollContactsInCampaign,
  updateCampaignContact,
  getEmailLogsByCampaign,
  markEmailReplied,
  getContactById,
} from "../db";
import { launchCampaign, processEmailQueue } from "../services/sequenceScheduler";

export const campaignsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const scope = dataScopeOrganizationId(ctx.user);
    return getCampaigns(scope);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(input.id, scope);
      assertCampaignScope(campaign, ctx.user);
      const steps = await getSequenceSteps(input.id);
      return { ...campaign!, steps };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().email().optional(),
        replyTo: z.string().email().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      await createCampaign({
        name: input.name,
        description: input.description,
        fromName: input.fromName ?? "Behberg",
        fromEmail: input.fromEmail ?? "outreach@behberg.com",
        replyTo: input.replyTo,
        status: "draft",
        organizationId: orgId ?? null,
      });
      return { success: true };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().email().optional(),
        replyTo: z.string().email().optional(),
        status: z.enum(["draft", "active", "paused", "completed"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(id, scope);
      assertCampaignScope(campaign, ctx.user);
      await updateCampaign(id, data, scope);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(input.id, scope);
      assertCampaignScope(campaign, ctx.user);
      await deleteSequenceStepsByCampaign(input.id);
      await deleteCampaign(input.id, scope);
      return { success: true };
    }),

  saveSteps: protectedProcedure
    .input(
      z.object({
        campaignId: z.number(),
        steps: z.array(
          z.object({
            id: z.number().optional(),
            stepOrder: z.number(),
            stepType: z.enum(["initial", "follow_up", "last_notice", "opened_no_reply"]),
            subject: z.string().min(1),
            bodyTemplate: z.string().min(1),
            delayDays: z.number().min(0).default(0),
            delayHours: z.number().min(0).default(0),
            condition: z
              .enum(["always", "not_opened", "opened_no_reply", "not_replied"])
              .default("always"),
            useLlmPersonalization: z.boolean().default(false),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
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

  contacts: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
      return getCampaignContacts(input.campaignId);
    }),

  enroll: protectedProcedure
    .input(
      z.object({
        campaignId: z.number(),
        contactIds: z.array(z.number()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
      for (const cid of input.contactIds) {
        const c = await getContactById(cid, scope);
        assertContactScope(c, ctx.user);
      }
      await enrollContactsInCampaign(input.campaignId, input.contactIds);
      return { success: true, enrolled: input.contactIds.length };
    }),

  launch: protectedProcedure
    .input(
      z.object({
        campaignId: z.number(),
        contactIds: z.array(z.number()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);

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
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
      await updateCampaign(input.campaignId, { status: "paused" }, scope);
      return { success: true };
    }),

  resume: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
      await updateCampaign(input.campaignId, { status: "active" }, scope);
      return { success: true };
    }),

  emailLogs: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
      return getEmailLogsByCampaign(input.campaignId);
    }),

  markReplied: protectedProcedure
    .input(z.object({ emailLogId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      agentDebugLog({
        runId: "post-fix",
        hypothesisId: "H_TENANT_MARK_REPLIED",
        location: "server/routers/campaigns.ts:markReplied",
        message: "markReplied called",
        data: { scopeOrganizationId: scope, emailLogId: input.emailLogId },
      });
      await markEmailReplied(input.emailLogId, scope);
      return { success: true };
    }),

  processQueue: protectedProcedure.mutation(async () => {
    const result = await processEmailQueue();
    return result;
  }),

  updateContactStatus: protectedProcedure
    .input(
      z.object({
        campaignContactId: z.number(),
        status: z.enum(["enrolled", "active", "completed", "unsubscribed", "bounced", "replied"]),
      }),
    )
    .mutation(async ({ input }) => {
      await updateCampaignContact(input.campaignContactId, { status: input.status });
      return { success: true };
    }),
});
