import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertCampaignScope, assertContactScope } from "../_core/orgAccess";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { requireTenantQueryScope } from "../_core/authz";
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
  getDefaultMailboxByOrganization,
  getMailboxById,
  isRecipientUnsubscribedFromMailbox,
  getNewPositiveRepliesSummary,
  setUserPositiveRepliesLastSeen,
  getOutreachStatsForOrganization,
} from "../db";
import { launchCampaign, processEmailQueue } from "../services/sequenceScheduler";

export const campaignsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const scope = requireTenantQueryScope(ctx.user);
    return getCampaigns(scope);
  }),

  /**
   * Unique opens / replies and provider segments (joins `email_logs` → `mailboxes`).
   * Campaign rollups (openCount) remain as stored; this is for dashboard "unique" metrics.
   */
  outreachStats: protectedProcedure.query(async ({ ctx }) => {
    const orgId = dataScopeOrganizationId(ctx.user);
    if (orgId == null) {
      return null;
    }
    return getOutreachStatsForOrganization(orgId);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope = requireTenantQueryScope(ctx.user);
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
        mailboxId: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      const defaultMailbox =
        input.mailboxId == null && orgId != null
          ? await getDefaultMailboxByOrganization(orgId)
          : undefined;
      const effectiveMailboxId = input.mailboxId ?? defaultMailbox?.id ?? null;
      if (input.mailboxId != null && orgId != null) {
        const mailbox = await getMailboxById(input.mailboxId);
        if (!mailbox || mailbox.organizationId !== orgId) {
          throw new Error("Selected mailbox is not available in this workspace");
        }
        if (input.fromEmail && input.fromEmail.toLowerCase() !== mailbox.email.toLowerCase()) {
          throw new Error("From email must match the connected mailbox identity");
        }
      }
      await createCampaign({
        name: input.name,
        description: input.description,
        fromName: input.fromName ?? defaultMailbox?.displayName ?? "Behberg",
        fromEmail: input.fromEmail ?? defaultMailbox?.email ?? "outreach@behberg.com",
        replyTo: input.replyTo ?? defaultMailbox?.email ?? null,
        mailboxId: effectiveMailboxId,
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
        mailboxId: z.number().nullable().optional(),
        status: z.enum(["draft", "active", "paused", "completed"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const scope = requireTenantQueryScope(ctx.user);
      const campaign = await getCampaignById(id, scope);
      assertCampaignScope(campaign, ctx.user);
      if (data.mailboxId != null) {
        const mailbox = await getMailboxById(data.mailboxId);
        if (!mailbox || (scope.type === "tenant" && mailbox.organizationId !== scope.organizationId)) {
          throw new Error("Selected mailbox is not available in this workspace");
        }
        if (data.fromEmail && data.fromEmail.toLowerCase() !== mailbox.email.toLowerCase()) {
          throw new Error("From email must match the connected mailbox identity");
        }
      }
      await updateCampaign(id, data, scope);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const scope = requireTenantQueryScope(ctx.user);
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
      const scope = requireTenantQueryScope(ctx.user);
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
      const scope = requireTenantQueryScope(ctx.user);
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
      const scope = requireTenantQueryScope(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
      if (!campaign.mailboxId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Connect a mailbox to this campaign before enrolling contacts.",
        });
      }
      for (const cid of input.contactIds) {
        const c = await getContactById(cid, scope);
        assertContactScope(c, ctx.user);
        if (c?.email) {
          const blocked = await isRecipientUnsubscribedFromMailbox(campaign.mailboxId, c.email);
          if (blocked) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Cannot enroll ${c.email}: this address unsubscribed from this mailbox.`,
            });
          }
        }
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
      const scope = requireTenantQueryScope(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);

      let contactIds = input.contactIds ?? [];
      if (contactIds.length) {
        if (!campaign.mailboxId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Connect a mailbox to this campaign before launching.",
          });
        }
        for (const cid of contactIds) {
          const c = await getContactById(cid, scope);
          assertContactScope(c, ctx.user);
          if (c?.email) {
            const blocked = await isRecipientUnsubscribedFromMailbox(campaign.mailboxId, c.email);
            if (blocked) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `Cannot launch for ${c.email}: this address unsubscribed from this mailbox.`,
              });
            }
          }
        }
        await enrollContactsInCampaign(input.campaignId, contactIds);
      } else {
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
      const scope = requireTenantQueryScope(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
      await updateCampaign(input.campaignId, { status: "paused" }, scope);
      return { success: true };
    }),

  resume: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const scope = requireTenantQueryScope(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
      await updateCampaign(input.campaignId, { status: "active" }, scope);
      return { success: true };
    }),

  emailLogs: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input, ctx }) => {
      const scope = requireTenantQueryScope(ctx.user);
      const campaign = await getCampaignById(input.campaignId, scope);
      assertCampaignScope(campaign, ctx.user);
      return getEmailLogsByCampaign(input.campaignId);
    }),

  markReplied: protectedProcedure
    .input(z.object({ emailLogId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const scope = requireTenantQueryScope(ctx.user);
      agentDebugLog({
        runId: "post-fix",
        hypothesisId: "H_TENANT_MARK_REPLIED",
        location: "server/routers/campaigns.ts:markReplied",
        message: "markReplied called",
        data: {
          scopeType: scope.type,
          tenantOrgId: scope.type === "tenant" ? scope.organizationId : null,
          emailLogId: input.emailLogId,
        },
      });
      await markEmailReplied(input.emailLogId, scope);
      return { success: true };
    }),

  processQueue: protectedProcedure.mutation(async () => {
    const result = await processEmailQueue();
    return result;
  }),

  newPositiveReplies: protectedProcedure.query(async ({ ctx }) => {
    const scope = requireTenantQueryScope(ctx.user);
    if (scope.type !== "tenant") {
      return { count: 0, campaigns: [] as { campaignId: number; count: number }[] };
    }
    return getNewPositiveRepliesSummary(scope.organizationId, ctx.user.id);
  }),

  acknowledgePositiveReplies: protectedProcedure.mutation(async ({ ctx }) => {
    await setUserPositiveRepliesLastSeen(ctx.user.id);
    return { success: true };
  }),

  updateContactStatus: protectedProcedure
    .input(
      z.object({
        campaignContactId: z.number(),
        status: z.enum([
          "enrolled",
          "active",
          "completed",
          "unsubscribed",
          "bounced",
          "replied",
          "positive_reply",
        ]),
      }),
    )
    .mutation(async ({ input }) => {
      await updateCampaignContact(input.campaignContactId, { status: input.status });
      return { success: true };
    }),
});
