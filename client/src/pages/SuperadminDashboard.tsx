import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clientMatchesDefaultOperatorLogin } from "@/lib/defaultOperatorClientHint";
import { trpc } from "@/lib/trpc";
import { BarChart3, Building2, Mail, Pencil, Settings2, UserPlus, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const PLATFORM_PLAN_OPTIONS = [
  { id: "free" as const, label: "Free" },
  { id: "basic" as const, label: "Basic" },
  { id: "business_standard" as const, label: "Business Standard" },
  { id: "pro" as const, label: "Pro" },
];

type EditableUserRow = {
  id: number;
  openId: string;
  email: string | null;
  name: string | null;
  role: "user" | "admin" | "superadmin";
  organizationId: number | null;
  organizationName: string | null;
  accountDisabled: boolean;
  isDefaultEnvOperator: boolean;
};

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  hint?: string;
}) {
  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
      <CardContent className="p-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
        </div>
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function RuntimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between py-2 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground font-mono">{value}</span>
    </div>
  );
}

export default function SuperadminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: loginOpts } = trpc.auth.loginOptions.useQuery();
  const operatorLoginHint =
    (user as { defaultOperatorLogin?: string | null } | null)?.defaultOperatorLogin ??
    loginOpts?.defaultAdminLogin;
  const canOperate = Boolean(
    !user?.accountDisabled &&
      (user?.isPlatformOperator ||
        user?.role === "superadmin" ||
        clientMatchesDefaultOperatorLogin(user, operatorLoginHint)),
  );

  const utils = trpc.useUtils();
  const overview = trpc.platform.overview.useQuery(undefined, {
    enabled: canOperate,
    retry: false,
  });
  const platformUsers = trpc.platform.users.useQuery(undefined, {
    enabled: canOperate,
    retry: false,
  });
  const runtimeInfo = trpc.platform.runtimeInfo.useQuery(undefined, {
    enabled: canOperate,
    retry: false,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<EditableUserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin" | "superadmin">("user");
  const [editDisabled, setEditDisabled] = useState(false);

  const openEdit = (row: EditableUserRow) => {
    setEditing(row);
    setEditName(row.name ?? "");
    setEditEmail(row.email ?? "");
    setEditRole(row.role);
    setEditDisabled(row.accountDisabled);
    setEditOpen(true);
  };

  const grantSuperadmin = trpc.platform.grantSuperadmin.useMutation({
    onSuccess: () => {
      toast.success("That user can now access the platform superadmin console.");
      void utils.platform.users.invalidate();
      void utils.platform.overview.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const disableSeededOperator = trpc.platform.disableSeededOperator.useMutation({
    onSuccess: () => {
      toast.success(
        "Default operator account disabled. Password sign-in for that identity is no longer accepted.",
      );
      void utils.platform.users.invalidate();
      void utils.auth.me.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const updateUser = trpc.platform.updateUser.useMutation({
    onSuccess: () => {
      toast.success("User updated.");
      setEditOpen(false);
      setEditing(null);
      void utils.platform.users.invalidate();
      void utils.platform.overview.invalidate();
      void utils.auth.me.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const [newOrgName, setNewOrgName] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignOrgId, setAssignOrgId] = useState("");
  const [assignRole, setAssignRole] = useState<"owner" | "member">("member");

  const createOrg = trpc.platform.createOrganization.useMutation({
    onSuccess: () => {
      toast.success("Organization created.");
      setNewOrgName("");
      void utils.platform.overview.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const setOrgPlan = trpc.platform.setOrganizationSubscription.useMutation({
    onSuccess: () => void utils.platform.overview.invalidate(),
    onError: err => toast.error(err.message),
  });

  const assignWs = trpc.platform.assignUserWorkspace.useMutation({
    onSuccess: () => {
      toast.success("Workspace membership updated.");
      setAssignUserId("");
      void utils.platform.users.invalidate();
      void utils.platform.overview.invalidate();
      void utils.platform.organizationMembers.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const selectedOrgIdNum = assignOrgId ? Number(assignOrgId) : 0;
  const orgMembers = trpc.platform.organizationMembers.useQuery(
    { organizationId: selectedOrgIdNum },
    { enabled: canOperate && selectedOrgIdNum > 0 },
  );

  useEffect(() => {
    if (!user) return;
    if (!canOperate) {
      setLocation("/app");
    }
  }, [user, canOperate, setLocation]);

  if (!user || !canOperate) {
    return (
      <DashboardLayout>
        <div className="p-6 text-muted-foreground text-sm">Checking access…</div>
      </DashboardLayout>
    );
  }

  const t = overview.data?.totals;
  const orgs = overview.data?.organizations ?? [];
  const rt = runtimeInfo.data;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2 max-w-6xl mx-auto">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Platform superadmin</h1>
            <Badge variant="secondary" className="font-normal">
              Behberg operator
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Instance-wide metrics, user records, and how major features are configured at runtime.
          </p>
        </div>

        {overview.isError ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base">Could not load overview</CardTitle>
              <CardDescription>
                {overview.error.message}. If you just deployed, run{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">pnpm db:migrate</code> so the
                database schema matches the app.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <Tabs defaultValue="overview" className="gap-6">
          <TabsList className="flex flex-wrap h-auto min-h-9 w-full sm:w-fit gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users & access</TabsTrigger>
            <TabsTrigger value="workspaces">Workspaces & plans</TabsTrigger>
            <TabsTrigger value="app">App configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title="Organizations" value={t?.organizations ?? 0} icon={Building2} />
              <StatCard title="Users" value={t?.users ?? 0} icon={Users} />
              <StatCard title="Contacts (all orgs)" value={t?.contacts ?? 0} icon={BarChart3} />
              <StatCard title="Campaigns (all orgs)" value={t?.campaigns ?? 0} icon={Mail} />
            </div>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Workspaces</CardTitle>
                <CardDescription>Organizations on this instance, newest first.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.isLoading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
                ) : orgs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No organizations yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">Members</TableHead>
                        <TableHead className="text-right">Contacts</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgs.map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-muted-foreground">{o.id}</TableCell>
                          <TableCell className="font-medium">{o.name}</TableCell>
                          <TableCell>
                            <Select
                              value={o.subscriptionPlanId ?? "free"}
                              onValueChange={planId =>
                                setOrgPlan.mutate({
                                  organizationId: o.id,
                                  planId: planId as (typeof PLATFORM_PLAN_OPTIONS)[number]["id"],
                                })
                              }
                              disabled={setOrgPlan.isPending}
                            >
                              <SelectTrigger className="h-8 w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PLATFORM_PLAN_OPTIONS.map(p => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{o.memberCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{o.contactCount}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(o.createdAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workspaces" className="space-y-6 mt-4">
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Create organization</CardTitle>
                </div>
                <CardDescription>
                  Creates an empty workspace. Assign an owner from{" "}
                  <span className="font-medium text-foreground">Users & access</span> or below.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="space-y-2 flex-1">
                  <Label htmlFor="new-org-name">Workspace name</Label>
                  <Input
                    id="new-org-name"
                    value={newOrgName}
                    onChange={e => setNewOrgName(e.target.value)}
                    placeholder="Acme Inc."
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="button"
                  disabled={newOrgName.trim().length < 2 || createOrg.isPending}
                  onClick={() => createOrg.mutate({ name: newOrgName.trim() })}
                >
                  {createOrg.isPending ? "Creating…" : "Create workspace"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Assign user to workspace</CardTitle>
                </div>
                <CardDescription>
                  Set which organization a user belongs to and whether they are the workspace owner. Removing
                  from a workspace clears org access (they keep their platform login).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="assign-uid">User id</Label>
                    <Input
                      id="assign-uid"
                      inputMode="numeric"
                      value={assignUserId}
                      onChange={e => setAssignUserId(e.target.value.replace(/\D/g, ""))}
                      placeholder="e.g. 3"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Workspace</Label>
                    <Select value={assignOrgId || "__none"} onValueChange={v => setAssignOrgId(v === "__none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose organization" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None (remove from org)</SelectItem>
                        {orgs.map(o => (
                          <SelectItem key={o.id} value={String(o.id)}>
                            {o.name} (#{o.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Role in workspace</Label>
                    <Select
                      value={assignRole}
                      onValueChange={v => setAssignRole(v as "owner" | "member")}
                      disabled={!assignOrgId}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={!assignUserId || assignWs.isPending}
                      onClick={() => {
                        const uid = Number(assignUserId);
                        if (!Number.isFinite(uid) || uid < 1) {
                          toast.error("Enter a valid user id.");
                          return;
                        }
                        if (!assignOrgId) {
                          assignWs.mutate({ userId: uid, organizationId: null, orgMemberRole: null });
                          return;
                        }
                        assignWs.mutate({
                          userId: uid,
                          organizationId: Number(assignOrgId),
                          orgMemberRole: assignRole,
                        });
                      }}
                    >
                      {assignWs.isPending ? "Saving…" : "Apply"}
                    </Button>
                  </div>
                </div>

                {selectedOrgIdNum > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Members in selected workspace</p>
                    {orgMembers.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading members…</p>
                    ) : orgMembers.isError ? (
                      <p className="text-sm text-destructive">{orgMembers.error.message}</p>
                    ) : (orgMembers.data ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users in this workspace yet.</p>
                    ) : (
                      <div className="rounded-lg border border-border/40 divide-y divide-border/40">
                        {(orgMembers.data ?? []).map(m => (
                          <div key={m.id} className="p-3 flex flex-wrap justify-between gap-2 text-sm">
                            <div>
                              <p className="font-medium">{m.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">
                                id {m.id} · {m.email ?? "—"}
                              </p>
                            </div>
                            <Badge variant="outline" className="capitalize">
                              {m.orgMemberRole ?? "member"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4 mt-4">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Users & access</CardTitle>
                <CardDescription>
                  Edit display name, sign-in email, workspace role, and account status. Grant{" "}
                  <span className="font-medium text-foreground">superadmin</span> for full platform
                  console access, or use{" "}
                  <span className="font-medium text-foreground">Disable default operator</span> on the seeded
                  row after another superadmin exists.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {platformUsers.isLoading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Loading users…</p>
                ) : platformUsers.isError ? (
                  <p className="text-sm text-destructive">{platformUsers.error.message}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Email / login</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Workspace</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(platformUsers.data ?? []).map(row => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-muted-foreground">{row.id}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {row.email ?? row.openId}
                          </TableCell>
                          <TableCell className="text-sm">{row.name ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.organizationName ?? (row.organizationId ? `#${row.organizationId}` : "—")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={row.role === "superadmin" ? "default" : "secondary"}
                              className="font-normal"
                            >
                              {row.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {row.accountDisabled ? (
                              <Badge variant="outline" className="text-muted-foreground font-normal">
                                Disabled
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Active</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  grantSuperadmin.isPending ||
                                  disableSeededOperator.isPending ||
                                  updateUser.isPending
                                }
                                onClick={() => openEdit(row)}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                              {row.role !== "superadmin" && !row.accountDisabled ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={
                                    grantSuperadmin.isPending ||
                                    disableSeededOperator.isPending ||
                                    updateUser.isPending
                                  }
                                  onClick={() => grantSuperadmin.mutate({ userId: row.id })}
                                >
                                  Grant superadmin
                                </Button>
                              ) : null}
                              {row.isDefaultEnvOperator && !row.accountDisabled ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={
                                    grantSuperadmin.isPending ||
                                    disableSeededOperator.isPending ||
                                    updateUser.isPending
                                  }
                                  onClick={() => disableSeededOperator.mutate({ userId: row.id })}
                                >
                                  Disable default operator
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="app" className="space-y-4 mt-4">
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Runtime configuration</CardTitle>
                </div>
                <CardDescription>
                  Values come from the host environment. To change them, update deployment env vars or{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code> and restart the server.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {runtimeInfo.isLoading ? (
                  <p className="text-sm text-muted-foreground py-6">Loading…</p>
                ) : runtimeInfo.isError ? (
                  <p className="text-sm text-destructive">{runtimeInfo.error.message}</p>
                ) : rt ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-4">
                    <RuntimeRow label="Node environment" value={rt.nodeEnv} />
                    <RuntimeRow
                      label="DATABASE_URL set"
                      value={rt.databaseUrlConfigured ? "yes" : "no"}
                    />
                    <RuntimeRow label="Dev file auth (no MySQL)" value={rt.devFileAuth ? "yes" : "no"} />
                    <RuntimeRow label="Email OTP after password" value={rt.authRequireEmailOtp ? "on" : "off"} />
                    <RuntimeRow label="DISABLE_SCHEDULER" value={rt.disableScheduler ? "true" : "false"} />
                    <RuntimeRow
                      label="DISABLE_SIGNALS_SCHEDULER"
                      value={rt.disableSignalsScheduler ? "true" : "false"}
                    />
                    <RuntimeRow label="OAuth server URL configured" value={rt.oauthServerConfigured ? "yes" : "no"} />
                    <RuntimeRow
                      label="Firebase server auth (social sign-in)"
                      value={rt.firebaseSignInServerConfigured ? "yes" : "no"}
                    />
                    <RuntimeRow label="Default operator login id" value={rt.defaultAdminLogin} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={editOpen}
          onOpenChange={open => {
            setEditOpen(open);
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
              <DialogDescription>
                User id {editing?.id}. Changing email affects password sign-in when the account uses a stored
                password.
              </DialogDescription>
            </DialogHeader>
            {editing ? (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="su-name">Display name</Label>
                  <Input
                    id="su-name"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Name"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email (sign-in id)</Label>
                  <Input
                    id="su-email"
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="user@example.com"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={editRole} onValueChange={v => setEditRole(v as typeof editRole)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">user</SelectItem>
                      <SelectItem value="admin">admin</SelectItem>
                      <SelectItem value="superadmin">superadmin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="su-disabled"
                    checked={editDisabled}
                    onCheckedChange={c => setEditDisabled(c === true)}
                  />
                  <Label htmlFor="su-disabled" className="text-sm font-normal cursor-pointer">
                    Account disabled (cannot sign in)
                  </Label>
                </div>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!editing || updateUser.isPending}
                onClick={() => {
                  if (!editing) return;
                  updateUser.mutate({
                    userId: editing.id,
                    name: editName,
                    email: editEmail,
                    role: editRole,
                    accountDisabled: editDisabled,
                  });
                }}
              >
                {updateUser.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
