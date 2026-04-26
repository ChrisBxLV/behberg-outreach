import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { dataScopeOrganizationId } from "../_core/orgScope";
import { getDashboardOverview, type DashboardOverviewRangeDays } from "../db";

export const dashboardRouter = router({
  overview: protectedProcedure
    .input(
      z.object({
        rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(7),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = dataScopeOrganizationId(ctx.user);
      if (orgId == null) {
        return null;
      }
      return getDashboardOverview(orgId, input.rangeDays as DashboardOverviewRangeDays);
    }),
});

