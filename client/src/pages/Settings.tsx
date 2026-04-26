import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Mail, CheckCircle2, XCircle, RefreshCw,
  Play, AlertCircle, Users, CreditCard, MailPlus,
  Pencil, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";

const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "Free",
    priceEur: 0,
    mailboxLimit: 1,
    summary: "Limited email sequencing, CSV uploads, and signals access.",
  },
  {
    id: "basic",
    name: "Basic",
    priceEur: 49,
    mailboxLimit: 1,
    summary: "1 connected email, full sequencing, and limited enrichment.",
  },
  {
    id: "business_standard",
    name: "Business Standard",
    priceEur: 129,
    mailboxLimit: 3,
    summary: "3 connected emails, premium signals, and automations.",
  },
  {
    id: "pro",
    name: "Pro",
    priceEur: 249,
    mailboxLimit: 5,
    summary: "5 connected emails, unlimited enrichment, and beta access.",
  },
] as const;

function oauthReasonLabel(reason: string): string {
  switch (reason) {
    case "missing_app_base_url":
      return "Platform APP_BASE_URL is not configured.";
    case "missing_provider_config":
      return "OAuth client credentials are missing for this provider.";
    case "missing_encryption_secret":
      return "Token encryption secret is missing.";
    case "organization_context_required":
      return "You need an organization workspace to connect mailboxes.";
    default:
      return reason.replaceAll("_", " ");
  }
}

function MailboxSuppressionsPanel({ mailboxId }: { mailboxId: number }) {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.mailboxes.listSuppressions.useQuery({ mailboxId });
  const removeMutation = trpc.mailboxes.removeSuppression.useMutation({
    onSuccess: () => {
      void utils.mailboxes.listSuppressions.invalidate({ mailboxId });
      toast.success("Removed from suppression list.");
    },
    onError: e => toast.error(e.message),
  });
  const exportCsv = async () => {
    const csv = await utils.mailboxes.exportSuppressionsCsv.fetch({ mailboxId });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `suppressions-mailbox-${mailboxId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading suppressions…</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void exportCsv()}>
          Export CSV
        </Button>
      </div>
      {(rows?.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">No suppressed addresses for this mailbox.</p>
      ) : (
        <ul className="text-xs space-y-1 max-h-28 overflow-y-auto border border-border/40 rounded-md p-2 bg-background/30">
          {(rows ?? []).map(r => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{r.recipientEmail}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] shrink-0"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate({ id: r.id })}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function oauthFailureToast(provider: "google" | "microsoft", message: string): string {
  const text = message.toLowerCase();
  const aadCodeMatch = message.match(/AADSTS\d{5}/i);
  const aadCode = aadCodeMatch?.[0]?.toUpperCase() ?? null;
  if (text.includes("organization context required")) {
    return "Create or join an organization before connecting a mailbox.";
  }
  if (text.includes("mailbox limit reached")) {
    return "Mailbox limit reached. Purchase additional licenses in Manage Subscription.";
  }
  if (provider === "microsoft" && (text.includes("invalid_client") || text.includes("aadsts7000215"))) {
    return "Microsoft OAuth client secret is invalid. Use the Secret VALUE (not Secret ID) in MS client secret env.";
  }
  if (provider === "google" && text.includes("invalid_client")) {
    return "Google OAuth client secret is invalid. Ensure GOOGLE_* client id/secret env are correct.";
  }
  if (provider === "microsoft" && (text.includes("redirect_uri") || text.includes("aadsts50011"))) {
    return "Microsoft redirect URI mismatch. Ensure callback is https://krot.io/api/mailboxes/oauth/microsoft/callback";
  }
  if (provider === "google" && text.includes("redirect_uri")) {
    return "Google redirect URI mismatch. Ensure callback is https://krot.io/api/mailboxes/oauth/google/callback";
  }
  if (text.includes("invalid or expired")) {
    return "OAuth session expired. Click Connect again.";
  }
  if (text.includes("token exchange")) {
    if (provider === "microsoft" && aadCode) {
      return `Provider token exchange failed (${aadCode}).`;
    }
    return "Provider token exchange failed. Retry Connect and approve all permissions.";
  }
  return message;
}

function ProviderConnectTile(props: {
  provider: "google" | "microsoft";
  title: string;
  subtitle: string;
  ready: boolean;
  reasons: string[];
  onConnect: () => void;
  disabled: boolean;
  isPending: boolean;
}) {
  const Icon = props.provider === "google" ? Mail : MailPlus;
  const isMicrosoft = props.provider === "microsoft";
  const accent = isMicrosoft
    ? "from-sky-500/15 via-sky-500/5 to-transparent"
    : "from-rose-500/15 via-rose-500/5 to-transparent";
  const ring = props.ready
    ? "border-emerald-500/30 hover:border-emerald-400/50"
    : "border-border/40 hover:border-border/60";
  return (
    <button
      type="button"
      onClick={props.onConnect}
      disabled={props.disabled || !props.ready}
      className={[
        "group relative w-full text-left rounded-xl border bg-card/70 p-4 transition",
        "hover:shadow-md hover:-translate-y-[1px] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none",
        ring,
      ].join(" ")}
    >
      <div className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br ${accent}`} />
      <div className="relative flex items-start gap-3">
        <div
          className={[
            "mt-0.5 rounded-lg border px-2.5 py-2",
            isMicrosoft ? "border-sky-500/30 bg-sky-500/10" : "border-rose-500/30 bg-rose-500/10",
          ].join(" ")}
        >
          <Icon className={["h-4 w-4", isMicrosoft ? "text-sky-300" : "text-rose-300"].join(" ")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{props.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{props.subtitle}</p>
            </div>
            {props.ready ? (
              <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/25">
                <CheckCircle2 className="h-3 w-3" />
                Ready
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/30 text-amber-200 bg-amber-500/10">
                <AlertCircle className="h-3 w-3" />
                Needs setup
              </Badge>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              {props.ready
                ? "Connect and grant permissions to start sending."
                : props.reasons.length
                  ? props.reasons.map(oauthReasonLabel).join(" ")
                  : "OAuth is not configured yet."}
            </div>
            <div className="shrink-0 text-xs font-medium text-foreground/90">
              {props.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Connecting…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  Connect
                  <ChevronDown className="h-4 w-4 opacity-0 group-hover:opacity-80 transition-opacity" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function Settings() {
  const utils = trpc.useUtils();
  const { user } = useAuth();

  const { data: smtpConfig } = trpc.settings.getSmtpConfig.useQuery();
  const { data: mailboxes } = trpc.mailboxes.list.useQuery();
  const { data: mailboxOAuthConfig, isLoading: mailboxOAuthConfigLoading } = trpc.settings.getMailboxOAuthConfig.useQuery();
  const { data: orgMine, isLoading: isOrgMineLoading } = trpc.organization.mine.useQuery();
  const isOrgOwner = orgMine?.role === "owner";
  const canSeeMembers = Boolean(orgMine?.organization?.id);
  const createMine = trpc.organization.createMine.useMutation({
    onSuccess: () => {
      toast.success("Organization created.");
      void utils.organization.mine.invalidate();
      void utils.organization.members.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const { data: members, refetch: refetchMembers } = trpc.organization.members.useQuery(undefined, {
    enabled: canSeeMembers,
  });

  const updateMember = trpc.organization.updateMember.useMutation({
    onSuccess: () => {
      toast.success("Member updated.");
      void refetchMembers();
      void utils.organization.members.invalidate();
      setEditMemberOpen(false);
      setEditingMember(null);
    },
    onError: e => toast.error(e.message),
  });

  const removeMember = trpc.organization.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed from organization.");
      void refetchMembers();
      void utils.organization.members.invalidate();
      setEditMemberOpen(false);
      setEditingMember(null);
    },
    onError: e => toast.error(e.message),
  });

  const [memberLoginId, setMemberLoginId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("free");
  const [additionalMailboxes, setAdditionalMailboxes] = useState(0);
  const [additionalOrganizations, setAdditionalOrganizations] = useState(0);

  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<
    | {
        id: number;
        name: string | null;
        email: string | null;
        orgMemberRole: "owner" | "member" | null;
      }
    | null
  >(null);
  const [editMemberName, setEditMemberName] = useState("");
  const [editMemberRole, setEditMemberRole] = useState<"owner" | "member">("member");
  const [smtpMailboxForm, setSmtpMailboxForm] = useState({
    email: "",
    displayName: "",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    username: "",
    password: "",
  });
  const [mailboxTestEmail, setMailboxTestEmail] = useState("");
  const [smtpTestRecipientEmail, setSmtpTestRecipientEmail] = useState("");
  const [showAdvancedSmtp, setShowAdvancedSmtp] = useState(false);
  const [showManualMailboxSetup, setShowManualMailboxSetup] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState("organization");
  const [mailboxesSubTab, setMailboxesSubTab] = useState("inboxes");
  const [selectedSignatureMailboxId, setSelectedSignatureMailboxId] = useState<number | null>(null);
  const logoUploadMailboxIdRef = useRef<number | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const requestPasswordResetSelf = trpc.organization.requestPasswordResetSelf.useMutation({
    onSuccess: (r) => {
      if (r.success && "emailed" in r && r.emailed) {
        toast.success("Password reset code sent.");
        return;
      }
      if (r.success && "emailed" in r && !r.emailed) {
        toast.message("No password reset email sent for this account.");
        return;
      }
      toast.error("Password reset request failed.");
    },
    onError: e => toast.error(e.message),
  });

  const requestPasswordResetMember = trpc.organization.requestPasswordResetMember.useMutation({
    onSuccess: (r) => {
      if (r.success && "emailed" in r && r.emailed) {
        toast.success("Password reset code sent.");
        return;
      }
      if (r.success && "emailed" in r && !r.emailed) {
        toast.message("No password reset email sent for that account.");
        return;
      }
      toast.error("Password reset request failed.");
    },
    onError: e => toast.error(e.message),
  });

  const openEditMember = (m: {
    id: number;
    name: string | null;
    email: string | null;
    orgMemberRole: "owner" | "member" | null;
  }) => {
    setEditingMember(m);
    setEditMemberName(m.name ?? "");
    setEditMemberRole((m.orgMemberRole ?? "member") as any);
    setEditMemberOpen(true);
  };

  const addMemberMutation = trpc.organization.addMember.useMutation({
    onSuccess: (r) => {
      if (!r.success) {
        if (r.reason === "login_taken") toast.error("That sign-in id is already in use.");
        else toast.error("Could not add member.");
        return;
      }
      toast.success("Member added. They can sign in with the password you set.");
      setMemberLoginId("");
      setMemberName("");
      setMemberPassword("");
      void refetchMembers();
      void utils.organization.members.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const testSmtpMutation = trpc.email.testSmtp.useMutation({
    onSuccess: (r) => {
      if (r.success) {
        toast.success("SMTP connection successful! Test email sent.");
      } else {
        toast.error(`SMTP test failed: ${r.error}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const startOAuthMutation = trpc.mailboxes.startConnectOAuth.useMutation({
    onSuccess: (r) => {
      window.location.href = r.authorizeUrl;
    },
    onError: e => toast.error(oauthFailureToast("microsoft", e.message)),
  });

  const completeOAuthMutation = trpc.mailboxes.completeConnectOAuth.useMutation({
    onSuccess: () => {
      toast.success("Mailbox connected successfully.");
      void utils.mailboxes.list.invalidate();
    },
    onError: e => toast.error(oauthFailureToast("microsoft", e.message)),
  });

  const connectSmtpMailboxMutation = trpc.mailboxes.connectSmtp.useMutation({
    onSuccess: () => {
      toast.success("SMTP mailbox connected.");
      setSmtpMailboxForm({
        email: "",
        displayName: "",
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        username: "",
        password: "",
      });
      void utils.mailboxes.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const setDefaultMailboxMutation = trpc.mailboxes.setDefault.useMutation({
    onSuccess: () => {
      toast.success("Default mailbox updated.");
      void utils.mailboxes.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const disconnectMailboxMutation = trpc.mailboxes.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Mailbox disconnected.");
      void utils.mailboxes.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const testMailboxMutation = trpc.mailboxes.testSend.useMutation({
    onSuccess: (r) => {
      if (r.success) toast.success("Mailbox test email sent.");
      else toast.error(r.error ?? "Mailbox test failed.");
      void utils.mailboxes.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const updateSignatureMutation = trpc.mailboxes.updateSignature.useMutation({
    onSuccess: () => {
      toast.success("Signature saved.");
      void utils.mailboxes.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const [sigDraft, setSigDraft] = useState<Record<number, { html: string; logo: string }>>({});

  useEffect(() => {
    if (!mailboxes?.length) return;
    setSigDraft(prev => {
      const n = { ...prev };
      for (const m of mailboxes) {
        if (n[m.id] === undefined) {
          n[m.id] = {
            html: (m as { signatureHtml?: string | null }).signatureHtml ?? "",
            logo: (m as { signatureLogoUrl?: string | null }).signatureLogoUrl ?? "",
          };
        }
      }
      return n;
    });
  }, [mailboxes]);

  useEffect(() => {
    if (!mailboxes?.length) {
      setSelectedSignatureMailboxId(null);
      return;
    }
    setSelectedSignatureMailboxId(prev => {
      if (prev != null && mailboxes.some(m => m.id === prev)) return prev;
      return mailboxes[0]!.id;
    });
  }, [mailboxes]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "organization" || tab === "smtp" || tab === "subscription") {
      setActiveSettingsTab(tab);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const attemptId = params.get("mailbox_oauth_attempt");
    const status = params.get("mailbox_oauth_status");
    const reason = params.get("mailbox_oauth_reason");
    const provider = params.get("mailbox_oauth_provider");
    const code = params.get("mailbox_oauth_code");
    const state = params.get("mailbox_oauth_state");
    const error = params.get("mailbox_oauth_error");

    if (attemptId) {
      void utils.mailboxes.getConnectResult.fetch({ attemptId })
        .then((result) => {
          if (result.status === "succeeded") {
            toast.success("Mailbox connected successfully.");
            void utils.mailboxes.list.invalidate();
            return;
          }
          const resolvedReason = result.reason ?? reason ?? "unknown";
          const detail = String(result.message ?? "").trim();
          if (detail) {
            toast.error(oauthFailureToast(result.provider, detail));
            return;
          }
          toast.error(`Mailbox connect failed: ${oauthReasonLabel(resolvedReason)}`);
        })
        .catch((e: any) => toast.error(oauthFailureToast("microsoft", String(e?.message ?? "Mailbox connect failed"))));
    } else if (error) {
      toast.error(`Mailbox OAuth failed: ${oauthReasonLabel(error)}`);
    } else if (provider && code && state && !completeOAuthMutation.isPending) {
      // Backward-compatible completion for old callback URLs.
      completeOAuthMutation.mutate({
        provider: provider as "google" | "microsoft",
        code,
        state,
      });
    } else if (status === "error" && reason) {
      toast.error(`Mailbox OAuth failed: ${oauthReasonLabel(reason)}`);
    }

    if (attemptId || status || reason || provider || code || state || error) {
      const nextUrl = `${window.location.pathname}`;
      window.history.replaceState({}, "", nextUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasOrgContext = Boolean(mailboxOAuthConfig?.hasOrganizationContext);
  const googleReasons = mailboxOAuthConfig?.readinessReasons?.google ?? [];
  const microsoftReasons = mailboxOAuthConfig?.readinessReasons?.microsoft ?? [];
  const googleReady = Boolean(
    mailboxOAuthConfig?.googleConfigured &&
    mailboxOAuthConfig?.tokenEncryptionConfigured &&
    mailboxOAuthConfig?.appBaseUrl &&
    hasOrgContext,
  );
  const microsoftReady = Boolean(
    mailboxOAuthConfig?.microsoftConfigured &&
    mailboxOAuthConfig?.tokenEncryptionConfigured &&
    mailboxOAuthConfig?.appBaseUrl &&
    hasOrgContext,
  );
  const canStartAnyOAuth = googleReady || microsoftReady;
  const canUseAdvancedSmtp = Boolean(
    isOrgOwner || user?.role === "admin" || user?.role === "superadmin",
  );
  const connectedMailboxCount = mailboxes?.length ?? 0;
  const currentPlan =
    SUBSCRIPTION_PLANS.find((p) => p.id === orgMine?.organization?.subscriptionPlanId) ??
    SUBSCRIPTION_PLANS[0];
  const mailboxLimit = currentPlan.mailboxLimit;
  const mailboxLimitReached = connectedMailboxCount >= mailboxLimit;
  const selectedSignatureMailbox = (mailboxes ?? []).find(m => m.id === selectedSignatureMailboxId) ?? null;
  const selectedSignatureDraft = selectedSignatureMailbox
    ? (sigDraft[selectedSignatureMailbox.id] ?? { html: "", logo: "" })
    : { html: "", logo: "" };

  const startOAuthFor = (provider: "google" | "microsoft") => {
    if (mailboxOAuthConfigLoading) {
      toast.message("Checking mailbox OAuth readiness...");
      return;
    }
    if (mailboxLimitReached) {
      toast.error("Mailbox limit reached. Purchase additional licenses in Manage Subscription.");
      return;
    }
    if (!hasOrgContext) {
      toast.error("Create or join an organization before connecting a mailbox.");
      return;
    }
    const ready = provider === "google" ? googleReady : microsoftReady;
    if (!ready) {
      const reasons = provider === "google" ? googleReasons : microsoftReasons;
      const firstReason = reasons[0] ?? "unknown";
      toast.error(`${provider === "google" ? "Google" : "Microsoft"} connect unavailable: ${oauthReasonLabel(firstReason)}`);
      return;
    }
    startOAuthMutation.mutate({ provider });
  };

  const membersBranch =
    isOrgMineLoading ? "loading" : canSeeMembers ? "card" : "no_org_or_role";
  const selectedPlan = SUBSCRIPTION_PLANS.find((plan) => plan.id === selectedPlanId) ?? SUBSCRIPTION_PLANS[0];
  const mailboxAddonTotal = additionalMailboxes * 15;
  const orgAddonUnitPrice = 49;
  const orgAddonTotal = additionalOrganizations * orgAddonUnitPrice;
  const estimatedMonthlyTotal = selectedPlan.priceEur + mailboxAddonTotal + orgAddonTotal;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Configure your integrations and platform settings</p>
        </div>

        <Tabs value={activeSettingsTab} onValueChange={setActiveSettingsTab}>
          <TabsList className="bg-muted/30 border border-border/50">
            <TabsTrigger value="organization">Organization</TabsTrigger>
            <TabsTrigger value="smtp">Mailboxes</TabsTrigger>
            <TabsTrigger value="subscription">Manage Subscription</TabsTrigger>
          </TabsList>

          <TabsContent value="organization" className="mt-4">
            {membersBranch === "loading" ? (
              <p className="text-sm text-muted-foreground">Loading organization…</p>
            ) : membersBranch === "card" ? (
              <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-violet-500/20">
                  <Users className="h-5 w-5 text-violet-300" />
                </div>
                <div>
                  <CardTitle className="text-base">Organization</CardTitle>
                  <CardDescription className="text-xs">
                    {orgMine?.organization?.name ?? "This workspace"} — add people who can sign in and use this workspace.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Workspace</p>
                  <p className="font-medium">{orgMine?.organization?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Your role</p>
                  <p className="font-medium capitalize">{orgMine?.role ?? "member"}</p>
                </div>
              </div>

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Members</p>
              <div className="rounded-lg border border-border/40 divide-y divide-border/40">
                {(members ?? []).length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No members yet besides you.</p>
                ) : (
                  (members ?? []).map(m => (
                    <div key={m.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div>
                        <p className="font-medium">{m.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{m.email ?? "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {m.orgMemberRole ?? "member"}
                        </Badge>
                        {isOrgOwner ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              openEditMember({
                                id: m.id,
                                name: m.name ?? null,
                                email: m.email ?? null,
                                orgMemberRole: (m.orgMemberRole ?? "member") as any,
                              })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-lg border border-border/30 bg-muted/10 p-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Password reset
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Members can reset only their own password. Owners can send reset codes for anyone in the organization.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={requestPasswordResetSelf.isPending}
                  onClick={() => requestPasswordResetSelf.mutate()}
                >
                  {requestPasswordResetSelf.isPending ? "Sending…" : "Send my reset code"}
                </Button>
              </div>
              {isOrgOwner ? (
                <div className="space-y-3 p-4 rounded-lg bg-muted/20 border border-border/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add member</p>
                  <Input
                    placeholder="Sign-in email or username"
                    value={memberLoginId}
                    onChange={e => setMemberLoginId(e.target.value)}
                    autoComplete="off"
                  />
                  <Input
                    placeholder="Display name"
                    value={memberName}
                    onChange={e => setMemberName(e.target.value)}
                    autoComplete="off"
                  />
                  <Input
                    type="password"
                    placeholder="Temporary password (min 8 chars)"
                    value={memberPassword}
                    onChange={e => setMemberPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Button
                    size="sm"
                    disabled={addMemberMutation.isPending || memberPassword.length < 8}
                    onClick={() =>
                      addMemberMutation.mutate({
                        loginId: memberLoginId.trim().toLowerCase(),
                        displayName: memberName.trim(),
                        password: memberPassword,
                      })
                    }
                  >
                    {addMemberMutation.isPending ? "Adding…" : "Add member"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Share the sign-in id and password securely. They use the same Sign in page as you.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Only organization owners can add members.</p>
              )}
            </CardContent>
              </Card>
            ) : (
              <Card className="border-border/50 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">No organization yet</CardTitle>
                  <CardDescription className="text-xs">
                    Create a workspace for this account to start adding members and managing subscription.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Organization name (e.g. Acme Inc.)"
                    value={newOrgName}
                    onChange={e => setNewOrgName(e.target.value)}
                    autoComplete="off"
                  />
                  <Button
                    size="sm"
                    disabled={createMine.isPending || newOrgName.trim().length < 2}
                    onClick={() => createMine.mutate({ name: newOrgName.trim() })}
                  >
                    {createMine.isPending ? "Creating…" : "Create organization"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    If you expected to already be in a workspace, ask your org admin to invite you, or sign out and sign back in.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="smtp" className="mt-4">
            {/* SMTP Configuration */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Mailboxes</CardTitle>
                <CardDescription className="text-xs">
                  Connect Gmail or Microsoft for best deliverability. Use manual SMTP only if needed.
                </CardDescription>
              </div>
              <div className="ml-auto">
                {canStartAnyOAuth ? (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />OAuth Ready
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />OAuth Setup Needed
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Mailbox licenses</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium text-foreground">{connectedMailboxCount}</span> of{" "}
                    <span className="font-medium text-foreground">{mailboxLimit}</span> used on {currentPlan.name}.
                  </p>
                </div>
                <Badge variant="outline" className="bg-background/30">
                  {connectedMailboxCount}/{mailboxLimit}
                </Badge>
              </div>
              <div className="mt-3">
                <Progress value={mailboxLimit > 0 ? Math.min(100, (connectedMailboxCount / mailboxLimit) * 100) : 0} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ProviderConnectTile
                provider="google"
                title="Gmail"
                subtitle="Fastest connect for Google Workspace and personal Gmail."
                ready={googleReady}
                reasons={googleReasons}
                onConnect={() => startOAuthFor("google")}
                disabled={startOAuthMutation.isPending || mailboxLimitReached || completeOAuthMutation.isPending}
                isPending={startOAuthMutation.isPending || completeOAuthMutation.isPending}
              />
              <ProviderConnectTile
                provider="microsoft"
                title="Microsoft"
                subtitle="Outlook.com and Microsoft 365 via Graph OAuth."
                ready={microsoftReady}
                reasons={microsoftReasons}
                onConnect={() => startOAuthFor("microsoft")}
                disabled={startOAuthMutation.isPending || mailboxLimitReached || completeOAuthMutation.isPending}
                isPending={startOAuthMutation.isPending || completeOAuthMutation.isPending}
              />
            </div>

            {mailboxLimitReached ? (
              <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                <AlertCircle />
                <AlertTitle>Mailbox limit reached</AlertTitle>
                <AlertDescription className="text-amber-100/90">
                  You have reached your mailbox limit ({connectedMailboxCount}/{mailboxLimit}). Purchase additional
                  licenses to connect more inboxes.
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={() => setActiveSettingsTab("subscription")}>
                      Manage subscription
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {!canStartAnyOAuth ? (
              <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                <AlertCircle />
                <AlertTitle>OAuth connect is blocked</AlertTitle>
                <AlertDescription className="text-amber-100/90">
                  Fix the setup requirements below, then retry connect.
                  <div className="mt-3 space-y-1 text-xs">
                    <p>
                      <span className="font-medium">Google:</span>{" "}
                      {googleReasons.length > 0 ? googleReasons.map(oauthReasonLabel).join(" ") : "Ready."}
                    </p>
                    <p>
                      <span className="font-medium">Microsoft:</span>{" "}
                      {microsoftReasons.length > 0 ? microsoftReasons.map(oauthReasonLabel).join(" ") : "Ready."}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <Separator className="bg-border/50" />

            <input
              ref={logoFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async e => {
                const mid = logoUploadMailboxIdRef.current;
                logoUploadMailboxIdRef.current = null;
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!mid || !file) return;
                try {
                  const fd = new FormData();
                  fd.append("file", file);
                  fd.append("mailboxId", String(mid));
                  const res = await fetch(`${window.location.origin}/api/mailboxes/signature-asset`, {
                    method: "POST",
                    body: fd,
                    credentials: "include",
                  });
                  const j = (await res.json()) as { url?: string; error?: string };
                  if (!res.ok) {
                    throw new Error(j.error ?? "Upload failed");
                  }
                  if (j.url) {
                    setSigDraft(prev => ({
                      ...prev,
                      [mid]: { ...(prev[mid] ?? { html: "", logo: "" }), logo: j.url! },
                    }));
                    toast.success("Logo uploaded. Click Save signature to apply.");
                  }
                } catch (err: any) {
                  toast.error(err?.message ?? "Upload failed");
                }
              }}
            />

            <Tabs value={mailboxesSubTab} onValueChange={setMailboxesSubTab}>
              <TabsList className="bg-muted/30 border border-border/50">
                <TabsTrigger value="inboxes">Connected Inboxes</TabsTrigger>
                <TabsTrigger value="signatures">Signatures</TabsTrigger>
              </TabsList>

              <TabsContent value="inboxes" className="mt-4">
                <div className="rounded-lg bg-muted/20 border border-border/30 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Connected inboxes</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{connectedMailboxCount}/{mailboxLimit}</Badge>
                        <Input
                          className="h-8 w-64 bg-background/30 border-border/50"
                          value={mailboxTestEmail}
                          onChange={(e) => setMailboxTestEmail(e.target.value)}
                          placeholder="Test recipient email"
                        />
                      </div>
                    </div>
                  </div>
                  {connectedMailboxCount === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
                      <p>No inbox connected yet. Use Connect Gmail or Connect Microsoft above.</p>
                      <p className="mt-2 text-xs">
                        After you connect an inbox, each mailbox row will show a <span className="font-medium">Test send</span> button.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(mailboxes ?? []).map((mailbox) => (
                        <div key={mailbox.id} className="rounded-lg border border-border/40 p-3 bg-background/40">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{mailbox.displayName ?? mailbox.email}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {mailbox.provider.toUpperCase()} · {mailbox.email}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={mailbox.status === "connected" ? "default" : "outline"}>
                                {mailbox.status}
                              </Badge>
                              {mailbox.isDefault ? <Badge>Default</Badge> : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {!mailbox.isDefault ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={setDefaultMailboxMutation.isPending}
                                onClick={() => setDefaultMailboxMutation.mutate({ mailboxId: mailbox.id })}
                              >
                                Set default
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!mailboxTestEmail || testMailboxMutation.isPending}
                              onClick={() =>
                                testMailboxMutation.mutate({
                                  mailboxId: mailbox.id,
                                  toEmail: mailboxTestEmail,
                                })
                              }
                            >
                              Test send
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={disconnectMailboxMutation.isPending}
                              onClick={() => disconnectMailboxMutation.mutate({ mailboxId: mailbox.id })}
                            >
                              Disconnect
                            </Button>
                          </div>
                          <div className="mt-4 space-y-2 border-t border-border/30 pt-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Unsubscribe applies per connected mailbox. Anyone who shares this mailbox shares the same suppression list.
                            </p>
                            <MailboxSuppressionsPanel mailboxId={mailbox.id} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="signatures" className="mt-4">
                <div className="rounded-lg bg-muted/20 border border-border/30 p-4 space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Email signature</p>
                    <p className="text-xs text-muted-foreground">
                      Set signature and logo separately from mailbox connection settings.
                    </p>
                  </div>

                  {connectedMailboxCount === 0 || !selectedSignatureMailbox ? (
                    <div className="rounded-lg border border-dashed border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
                      Connect an inbox first to configure its signature.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="max-w-sm">
                        <p className="text-xs text-muted-foreground mb-1">Mailbox</p>
                        <Select
                          value={String(selectedSignatureMailbox.id)}
                          onValueChange={value => setSelectedSignatureMailboxId(Number.parseInt(value, 10))}
                        >
                          <SelectTrigger className="bg-muted/30 border-border/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(mailboxes ?? []).map(m => (
                              <SelectItem key={m.id} value={String(m.id)}>
                                {(m.displayName ?? m.email)} ({m.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-wrap gap-2 items-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            logoUploadMailboxIdRef.current = selectedSignatureMailbox.id;
                            logoFileInputRef.current?.click();
                          }}
                        >
                          Upload logo
                        </Button>
                        <span className="text-[11px] text-muted-foreground">or paste</span>
                      </div>
                      <Input
                        className="h-8 text-sm"
                        placeholder="Logo image URL (optional, https...)"
                        value={selectedSignatureDraft.logo}
                        onChange={e => setSigDraft(prev => ({
                          ...prev,
                          [selectedSignatureMailbox.id]: {
                            ...(prev[selectedSignatureMailbox.id] ?? { html: "", logo: "" }),
                            logo: e.target.value,
                          },
                        }))}
                      />
                      <Textarea
                        className="min-h-[96px] text-sm"
                        placeholder="Use simple HTML. Example: Best,<br>Arthur"
                        value={selectedSignatureDraft.html}
                        onChange={e => setSigDraft(prev => ({
                          ...prev,
                          [selectedSignatureMailbox.id]: {
                            ...(prev[selectedSignatureMailbox.id] ?? { html: "", logo: "" }),
                            html: e.target.value,
                          },
                        }))}
                      />
                      <div className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Signature preview</p>
                        <div className="rounded-md border border-border/40 bg-white text-black p-4 text-sm">
                          <p>Hi {"{{firstName}}"},</p>
                          <p className="mt-2">This is how your signature appears below the email body.</p>
                          {(selectedSignatureDraft.logo.trim() || selectedSignatureDraft.html.trim()) ? (
                            <div className="mt-5 pt-4 border-t border-[#e5e5e5]">
                              {selectedSignatureDraft.logo.trim() ? (
                                <p style={{ margin: "0 0 12px" }}>
                                  <img
                                    src={selectedSignatureDraft.logo.trim()}
                                    alt=""
                                    style={{ maxHeight: "40px", maxWidth: "200px" }}
                                  />
                                </p>
                              ) : null}
                              {selectedSignatureDraft.html.trim() ? (
                                <div dangerouslySetInnerHTML={{ __html: selectedSignatureDraft.html }} />
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-5 pt-4 border-t border-[#e5e5e5] text-[#6b7280]">
                              Add a logo or signature HTML to preview it here.
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={updateSignatureMutation.isPending}
                        onClick={() => updateSignatureMutation.mutate({
                          mailboxId: selectedSignatureMailbox.id,
                          signatureHtml: selectedSignatureDraft.html || null,
                          signatureLogoUrl: selectedSignatureDraft.logo.trim()
                            ? selectedSignatureDraft.logo.trim()
                            : "",
                        })}
                      >
                        Save signature
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="rounded-lg border border-border/40 bg-muted/10">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setShowManualMailboxSetup(prev => !prev)}
              >
                <div>
                  <p className="text-sm font-medium">Connect other mailbox (manual)</p>
                  <p className="text-xs text-muted-foreground">Use SMTP if your provider is not Google or Microsoft.</p>
                </div>
                {showManualMailboxSetup ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {showManualMailboxSetup ? (
                <div className="border-t border-border/40 p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Mailbox Email</p>
                      <Input
                        className="mt-1 h-8"
                        value={smtpMailboxForm.email}
                        onChange={(e) => setSmtpMailboxForm((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="you@company.com"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Display Name</p>
                      <Input
                        className="mt-1 h-8"
                        value={smtpMailboxForm.displayName}
                        onChange={(e) => setSmtpMailboxForm((prev) => ({ ...prev, displayName: e.target.value }))}
                        placeholder="Jane from Sales"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">App Password</p>
                      <Input
                        className="mt-1 h-8"
                        type="password"
                        value={smtpMailboxForm.password}
                        onChange={(e) => setSmtpMailboxForm((prev) => ({ ...prev, password: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-end">
                      <p className="text-[11px] text-muted-foreground">
                        We auto-configure SMTP host, port, and username from your email.
                      </p>
                    </div>
                  </div>

                  {canUseAdvancedSmtp ? (
                    <div className="rounded-lg border border-border/40 p-3 bg-background/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">Admin SMTP override</p>
                          <p className="text-[11px] text-muted-foreground">
                            Enable only if your provider requires non-standard SMTP settings.
                          </p>
                        </div>
                        <Switch checked={showAdvancedSmtp} onCheckedChange={setShowAdvancedSmtp} />
                      </div>
                      {showAdvancedSmtp ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">SMTP Host</p>
                            <Input
                              className="mt-1 h-8"
                              value={smtpMailboxForm.host}
                              onChange={(e) => setSmtpMailboxForm((prev) => ({ ...prev, host: e.target.value }))}
                            />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">SMTP Port</p>
                            <Input
                              className="mt-1 h-8"
                              type="number"
                              value={smtpMailboxForm.port}
                              onChange={(e) =>
                                setSmtpMailboxForm((prev) => ({
                                  ...prev,
                                  port: Number.parseInt(e.target.value || "587", 10),
                                }))
                              }
                            />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">SMTP Username</p>
                            <Input
                              className="mt-1 h-8"
                              value={smtpMailboxForm.username}
                              onChange={(e) => setSmtpMailboxForm((prev) => ({ ...prev, username: e.target.value }))}
                            />
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Switch
                                checked={smtpMailboxForm.secure}
                                onCheckedChange={(checked) =>
                                  setSmtpMailboxForm((prev) => ({ ...prev, secure: checked }))
                                }
                              />
                              Use SSL/TLS
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-blue-300">
                      <p className="font-medium mb-1">Quick connect tip</p>
                      <p>Use your mailbox email and provider App Password. For Microsoft this is usually at <strong>account.microsoft.com → Security → App passwords</strong>. Gmail users can create one in Google Account security after enabling 2-Step Verification.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      className="h-8 w-72 bg-background/30 border-border/50"
                      value={smtpTestRecipientEmail}
                      onChange={(e) => setSmtpTestRecipientEmail(e.target.value)}
                      placeholder="Test recipient email"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        connectSmtpMailboxMutation.mutate({
                          email: smtpMailboxForm.email.trim(),
                          displayName: smtpMailboxForm.displayName.trim() || undefined,
                          ...(showAdvancedSmtp && canUseAdvancedSmtp
                            ? {
                                host: smtpMailboxForm.host.trim(),
                                port: smtpMailboxForm.port,
                                secure: smtpMailboxForm.secure,
                                username: smtpMailboxForm.username.trim() || smtpMailboxForm.email.trim(),
                              }
                            : {}),
                          password: smtpMailboxForm.password,
                        })
                      }
                      disabled={
                        connectSmtpMailboxMutation.isPending ||
                        mailboxLimitReached ||
                        !smtpMailboxForm.email ||
                        !smtpMailboxForm.password
                      }
                    >
                      Connect other mailbox
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testSmtpMutation.mutate()}
                      disabled={testSmtpMutation.isPending || !smtpConfig?.configured}
                    >
                      {testSmtpMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      Test Connection
                    </Button>
                    {!smtpConfig?.configured && (
                      <p className="text-xs text-muted-foreground self-center">Legacy global SMTP is not configured (optional).</p>
                    )}
                    {mailboxLimitReached ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => setActiveSettingsTab("subscription")}
                      >
                        Purchase Licenses
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

          </TabsContent>

          <TabsContent value="subscription" className="mt-4">
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <CreditCard className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Manage Subscription</CardTitle>
                    <CardDescription className="text-xs">
                      Select your plan and add-ons. Stripe checkout wiring comes next.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SUBSCRIPTION_PLANS.map((plan) => {
                    const isSelected = plan.id === selectedPlanId;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`text-left rounded-lg border p-4 transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border/40 bg-muted/10 hover:bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{plan.name}</p>
                          <Badge variant={isSelected ? "default" : "outline"}>
                            EUR {plan.priceEur}/mo
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{plan.summary}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
                  <div className="flex items-center gap-2">
                    <MailPlus className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">Additional mailboxes</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Each additional connected mailbox is billed at EUR 15/month.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAdditionalMailboxes((prev) => Math.max(0, prev - 1))}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      value={additionalMailboxes}
                      onChange={(e) => {
                        const value = Number.parseInt(e.target.value || "0", 10);
                        setAdditionalMailboxes(Number.isNaN(value) ? 0 : Math.max(0, value));
                      }}
                      className="w-24 bg-muted/20 border-border/50"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAdditionalMailboxes((prev) => prev + 1)}
                    >
                      +
                    </Button>
                    <p className="text-xs text-muted-foreground ml-2">
                      Add-on total: EUR {mailboxAddonTotal}/mo
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">Additional organizations</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add more organizations under your billing account for EUR {orgAddonUnitPrice}/month each.
                    (Billing enforcement will be connected when Stripe is wired.)
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAdditionalOrganizations((prev) => Math.max(0, prev - 1))}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      value={additionalOrganizations}
                      onChange={(e) => {
                        const value = Number.parseInt(e.target.value || "0", 10);
                        setAdditionalOrganizations(Number.isNaN(value) ? 0 : Math.max(0, value));
                      }}
                      className="w-24 bg-muted/20 border-border/50"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAdditionalOrganizations((prev) => prev + 1)}
                    >
                      +
                    </Button>
                    <p className="text-xs text-muted-foreground ml-2">
                      Add-on total: EUR {orgAddonTotal}/mo
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
                  <p className="text-xs text-muted-foreground">Estimated monthly total</p>
                  <p className="text-xl font-bold mt-1">EUR {estimatedMonthlyTotal}/mo</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Plan: {selectedPlan.name} (EUR {selectedPlan.priceEur}/mo)
                    {" "}+ {additionalMailboxes} mailbox add-on(s)
                    {" "}+ {additionalOrganizations} organization add-on(s).
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => toast.info("Stripe integration will be connected in this flow next.")}>
                      Connect Stripe
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toast.success("Selection saved locally for this session.")}>
                      Save Selection
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={editMemberOpen}
        onOpenChange={(open) => {
          setEditMemberOpen(open);
          if (!open) setEditingMember(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
            <DialogDescription>
              Update name and role, or remove this user from the organization.
            </DialogDescription>
          </DialogHeader>

          {editingMember ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm">
                <p className="text-xs text-muted-foreground">Member</p>
                <p className="font-medium">{editingMember.email ?? `User #${editingMember.id}`}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-edit-name">Display name</Label>
                <Input
                  id="member-edit-name"
                  value={editMemberName}
                  onChange={(e) => setEditMemberName(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editMemberRole} onValueChange={(v) => setEditMemberRole(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">member</SelectItem>
                    <SelectItem value="owner">owner</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Setting owner transfers ownership (only one owner is kept).
                </p>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Password reset</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sends a reset code if this account uses password sign-in.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={requestPasswordResetMember.isPending || updateMember.isPending || removeMember.isPending}
                  onClick={() => requestPasswordResetMember.mutate({ userId: editingMember.id })}
                >
                  {requestPasswordResetMember.isPending ? "Sending…" : "Send reset code"}
                </Button>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={
                !editingMember ||
                removeMember.isPending ||
                updateMember.isPending ||
                (editingMember?.orgMemberRole ?? "member") === "owner"
              }
              onClick={() => {
                if (!editingMember) return;
                removeMember.mutate({ userId: editingMember.id });
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove from org
            </Button>

            <div className="flex gap-2 justify-end w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => setEditMemberOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!editingMember || updateMember.isPending}
                onClick={() => {
                  if (!editingMember) return;
                  updateMember.mutate({
                    userId: editingMember.id,
                    name: editMemberName.trim(),
                    orgMemberRole: editMemberRole,
                  });
                }}
              >
                {updateMember.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
