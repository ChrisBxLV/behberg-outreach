import { TRPCError } from "@trpc/server";
import type { Campaign, Contact, User } from "../../drizzle/schema";
import { resolveTenantQueryScope } from "./authz";

export function assertContactScope(
  contact: Contact | null | undefined,
  user: User | null | undefined,
): asserts contact is Contact {
  if (!contact) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
  }
  if (user?.role === "superadmin" && !user.accountDisabled) return;
  const scope = resolveTenantQueryScope(user);
  if (scope == null) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
  }
  if (scope.type === "platform") return;
  if (contact.organizationId !== scope.organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
  }
}

export function assertCampaignScope(
  campaign: Campaign | null | undefined,
  user: User | null | undefined,
): asserts campaign is Campaign {
  if (!campaign) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
  }
  const scope = resolveTenantQueryScope(user);
  if (scope == null) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
  }
  if (scope.type === "platform") return;
  if (campaign.organizationId !== scope.organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
  }
}
