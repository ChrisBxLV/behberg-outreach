import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

export const settingsRouter = router({
  getSmtpConfig: protectedProcedure.query(async () => {
    return {
      host: process.env.SMTP_HOST ?? "smtp.office365.com",
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      user: process.env.SMTP_USER ?? "",
      configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    };
  }),

  getAppConfig: protectedProcedure.query(async () => {
    return {
      appBaseUrl: process.env.APP_BASE_URL ?? "",
      smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    };
  }),
});
