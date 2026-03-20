import { TRPCError } from "@trpc/server";
import type { Campaign, Contact, User } from "../../drizzle/schema";
import { dataScopeOrganizationId } from "./orgScope";

export function assertContactScope(contact: Contact | null | undefined, user: User | null | undefined) {
  if (!contact) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
  }
  const scope = dataScopeOrganizationId(user);
  if (scope == null) return;
  if (contact.organizationId !== scope) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
  }
}

export function assertCampaignScope(campaign: Campaign | null | undefined, user: User | null | undefined) {
  if (!campaign) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
  }
  const scope = dataScopeOrganizationId(user);
  if (scope == null) return;
  if (campaign.organizationId !== scope) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
  }
}
