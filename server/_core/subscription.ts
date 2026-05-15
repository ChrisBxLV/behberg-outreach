import { TRPCError } from "@trpc/server";
import { getOrganizationById } from "../db";

export type SubscriptionPlanId =
  | "free"
  | "starter"
  | "growth"
  | "scale"
  | "pro_teams"
  | "basic"
  | "business_standard"
  | "pro"
  | (string & {});

export function normalizeSubscriptionPlanId(planId: string | null | undefined): SubscriptionPlanId {
  return ((planId ?? "free").trim().toLowerCase() || "free") as SubscriptionPlanId;
}

export function hasEmailCheckerAccess(planId: string | null | undefined): boolean {
  const p = normalizeSubscriptionPlanId(planId);
  return (
    p === "starter" ||
    p === "growth" ||
    p === "scale" ||
    p === "pro_teams" ||
    p === "basic" ||
    p === "business_standard" ||
    p === "pro"
  );
}

export async function assertEmailCheckerAccess(organizationId: number): Promise<void> {
  const org = await getOrganizationById(organizationId);
  if (!hasEmailCheckerAccess(org?.subscriptionPlanId)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Email Checker is available on paid plans (Starter and up). Please upgrade to unlock this feature.",
    });
  }
}

