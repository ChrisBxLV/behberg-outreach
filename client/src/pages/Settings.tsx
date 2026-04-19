import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import {
  Mail, CheckCircle2, XCircle, RefreshCw,
  Settings2, Play, AlertCircle, Users, CreditCard, MailPlus,
  Pencil, Trash2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";

const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "Free",
    priceEur: 0,
    summary: "Limited email sequencing, CSV uploads, and signals access.",
  },
  {
    id: "basic",
    name: "Basic",
    priceEur: 49,
    summary: "1 connected email, full sequencing, and limited enrichment.",
  },
  {
    id: "business_standard",
    name: "Business Standard",
    priceEur: 129,
    summary: "3 connected emails, premium signals, and automations.",
  },
  {
    id: "pro",
    name: "Pro",
    priceEur: 249,
    summary: "5 connected emails, unlimited enrichment, and beta access.",
  },
] as const;

export default function Settings() {
  const utils = trpc.useUtils();
  const { user } = useAuth();

  const { data: smtpConfig } = trpc.settings.getSmtpConfig.useQuery();
  const { data: appConfig } = trpc.settings.getAppConfig.useQuery();
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

        <Tabs defaultValue="organization">
          <TabsList className="bg-muted/30 border border-border/50">
            <TabsTrigger value="organization">Organization</TabsTrigger>
            <TabsTrigger value="smtp">Outlook SMTP</TabsTrigger>
            <TabsTrigger value="subscription">Manage Subscription</TabsTrigger>
            <TabsTrigger value="platform">Platform Info</TabsTrigger>
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
                <CardTitle className="text-base">Outlook SMTP</CardTitle>
                <CardDescription className="text-xs">Email sending via @behberg.com</CardDescription>
              </div>
              <div className="ml-auto">
                {smtpConfig?.configured ? (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />Configured
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />Not Configured
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/20 border border-border/30">
              <div>
                <p className="text-xs text-muted-foreground">Host</p>
                <p className="text-sm font-medium mt-0.5">{smtpConfig?.host ?? "smtp.office365.com"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Port</p>
                <p className="text-sm font-medium mt-0.5">{smtpConfig?.port ?? 587}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="text-sm font-medium mt-0.5">{smtpConfig?.user || "Not set"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-300">
                <p className="font-medium mb-1">How to configure SMTP</p>
                <p>Set <code className="bg-blue-500/20 px-1 rounded">SMTP_USER</code> and <code className="bg-blue-500/20 px-1 rounded">SMTP_PASS</code> environment variables in the Secrets panel. Generate an App Password from your Microsoft account at <strong>account.microsoft.com → Security → App passwords</strong>.</p>
              </div>
            </div>

            <div className="flex gap-2">
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
                <p className="text-xs text-muted-foreground self-center">Configure SMTP_USER and SMTP_PASS secrets first</p>
              )}
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

          <TabsContent value="platform" className="mt-4">
            {/* Platform Info */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Settings2 className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">Platform Info</CardTitle>
                <CardDescription className="text-xs">Current configuration overview</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "App Base URL", value: appConfig?.appBaseUrl || "Not set" },
                { label: "SMTP", value: appConfig?.smtpConfigured ? "Configured" : "Not configured", ok: appConfig?.smtpConfigured },
                { label: "Email Tracking", value: appConfig?.appBaseUrl ? "Enabled (pixel tracking)" : "Needs APP_BASE_URL" },
              ].map(({ label, value, ok }) => (
                <div key={label} className="p-3 rounded-lg bg-muted/20 border border-border/30">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {ok !== undefined && (
                      ok ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> : <XCircle className="h-3 w-3 text-amber-400 shrink-0" />
                    )}
                    <p className="text-sm font-medium truncate">{value}</p>
                  </div>
                </div>
              ))}
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
