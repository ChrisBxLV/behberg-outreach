import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Mail, CheckCircle2, XCircle, RefreshCw,
  Settings2, Play, AlertCircle, Users,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Settings() {
  const utils = trpc.useUtils();

  const { data: smtpConfig } = trpc.settings.getSmtpConfig.useQuery();
  const { data: appConfig } = trpc.settings.getAppConfig.useQuery();
  const { data: orgMine, isLoading: isOrgMineLoading } = trpc.organization.mine.useQuery();
  const isOrgOwner = orgMine?.role === "owner";
  const canSeeMembers = Boolean(orgMine?.organization?.id);

  const { data: members, refetch: refetchMembers } = trpc.organization.members.useQuery(undefined, {
    enabled: canSeeMembers,
  });

  const [memberLoginId, setMemberLoginId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberPassword, setMemberPassword] = useState("");

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

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Configure your integrations and platform settings</p>
        </div>

        <Tabs defaultValue="members">
          <TabsList className="bg-muted/30 border border-border/50">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="smtp">Outlook SMTP</TabsTrigger>
            <TabsTrigger value="platform">Platform Info</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="mt-4">
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
                  <CardTitle className="text-base">Organization members</CardTitle>
                  <CardDescription className="text-xs">
                    {orgMine?.organization?.name ?? "This workspace"} — add people who can sign in and use this workspace.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
                      <Badge variant="outline" className="capitalize">
                        {m.orgMemberRole ?? "member"}
                      </Badge>
                    </div>
                  ))
                )}
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
              <p className="text-sm text-muted-foreground">
                No organization found for this account. Create an organization, or sign out and sign back in.
              </p>
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
    </DashboardLayout>
  );
}
