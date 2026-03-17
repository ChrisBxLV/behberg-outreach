import { z } from "zod";
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
    .mutation(async ({ input }) => {
      const contact = await getContactById(input.contactId);
      if (!contact) throw new Error("Contact not found");
      const variations = await generateEmailVariations(contact, input.stepType, input.count);
      return { variations };
    }),

  generateForContact: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      stepType: z.enum(["initial", "follow_up", "last_notice", "opened_no_reply"]),
      baseSubject: z.string(),
      baseBody: z.string(),
    }))
    .mutation(async ({ input }) => {
      const contact = await getContactById(input.contactId);
      if (!contact) throw new Error("Contact not found");
      const { generatePersonalizedEmail } = await import("../services/llmPersonalization");
      return generatePersonalizedEmail({
        contact,
        stepType: input.stepType,
        baseSubject: input.baseSubject,
        baseBody: input.baseBody,
      });
    }),
});
