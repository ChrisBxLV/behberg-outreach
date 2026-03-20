import { z } from "zod";
import { assertContactScope } from "../_core/orgAccess";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { protectedProcedure, router } from "../_core/trpc";
import { testSmtpConnection, resetTransporter } from "../services/emailService";
import { generateEmailVariations } from "../services/llmPersonalization";
import { getContactById } from "../db";

export const emailRouter = router({
  testSmtp: protectedProcedure
    .mutation(async () => {
      return testSmtpConnection();
    }),

  resetSmtp: protectedProcedure
    .mutation(async () => {
      resetTransporter();
      return { success: true };
    }),

  generateVariations: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      stepType: z.enum(["initial", "follow_up", "last_notice", "opened_no_reply"]),
      count: z.number().min(1).max(5).default(3),
    }))
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const contact = await getContactById(input.contactId, scope);
      assertContactScope(contact, ctx.user);
      const variations = await generateEmailVariations(contact!, input.stepType, input.count);
      return { variations };
    }),

  generateForContact: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      stepType: z.enum(["initial", "follow_up", "last_notice", "opened_no_reply"]),
      baseSubject: z.string(),
      baseBody: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const scope = dataScopeOrganizationId(ctx.user);
      const contact = await getContactById(input.contactId, scope);
      assertContactScope(contact, ctx.user);
      const { generatePersonalizedEmail } = await import("../services/llmPersonalization");
      return generatePersonalizedEmail({
        contact: contact!,
        stepType: input.stepType,
        baseSubject: input.baseSubject,
        baseBody: input.baseBody,
      });
    }),
});
