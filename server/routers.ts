import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { contactsRouter } from "./routers/contacts";
import { campaignsRouter } from "./routers/campaigns";
import { emailRouter } from "./routers/email";
import { settingsRouter } from "./routers/settings";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  contacts: contactsRouter,
  campaigns: campaignsRouter,
  email: emailRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
