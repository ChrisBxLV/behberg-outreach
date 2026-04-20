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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { BarChart3, Building2, Check, ChevronsUpDown, Mail, Pencil, Settings2, UserPlus, Users } from "lucide-react";
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
  onClick,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      data-glow={onClick ? "" : undefined}
      className={[
        "border-border/50 bg-card/80 backdrop-blur-sm",
        onClick
          ? [
              "cursor-pointer transition-colors",
              "relative overflow-hidden",
              "hover:bg-card/90",
              "hover:shadow-[0_18px_50px_-28px_oklch(from_var(--primary)_l_c_h_/_0.7)]",
            ].join(" ")
          : "",
      ].join(" ")}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground font-medium leading-tight whitespace-nowrap truncate">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-0 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-3xl font-bold tabular-nums">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
        </div>
        <div className="shrink-0 self-start p-3 rounded-xl bg-primary/10 text-primary">
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

function UsersTable({
  rows,
  onEdit,
  onGrantSuperadmin,
  onDisableDefaultOperator,
  busy,
}: {
  rows: EditableUserRow[];
  onEdit: (row: EditableUserRow) => void;
  onGrantSuperadmin: (userId: number) => void;
  onDisableDefaultOperator: (userId: number) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [grouped, setGrouped] = useState(true);
  const [sortBy, setSortBy] = useState<"orgThenEmail" | "email" | "id">("orgThenEmail");

  const Section = ({
    title,
    count,
    children,
  }: {
    title: string;
    count: number;
    children: React.ReactNode;
  }) => (
    <Card className="border-border/50 bg-card/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="font-normal tabular-nums">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(r => {
    if (!q) return true;
    const hay = [
      String(r.id),
      r.email ?? "",
      r.openId ?? "",
      r.name ?? "",
      r.role ?? "",
      r.organizationName ?? "",
      r.organizationId != null ? `#${r.organizationId}` : "",
      r.accountDisabled ? "disabled" : "active",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  const sorted = filtered.slice().sort((a, b) => {
    if (sortBy === "id") return a.id - b.id;
    if (sortBy === "email") return (a.email ?? a.openId).localeCompare(b.email ?? b.openId);
    // orgThenEmail
    const ao = a.role === "superadmin" ? "0" : a.organizationName ?? (a.organizationId != null ? `#${a.organizationId}` : "zz");
    const bo = b.role === "superadmin" ? "0" : b.organizationName ?? (b.organizationId != null ? `#${b.organizationId}` : "zz");
    const oc = ao.localeCompare(bo);
    if (oc !== 0) return oc;
    return (a.email ?? a.openId).localeCompare(b.email ?? b.openId);
  });

  const renderRows = (sub: EditableUserRow[]) => (
    <div className="rounded-lg border border-border/50 overflow-hidden">
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
        {sub.map(row => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-muted-foreground">{row.id}</TableCell>
            <TableCell className="max-w-[240px] truncate text-sm">{row.email ?? row.openId}</TableCell>
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
                  disabled={busy}
                  onClick={() => onEdit(row)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                {row.role !== "superadmin" && !row.accountDisabled ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onGrantSuperadmin(row.id)}
                  >
                    Grant superadmin
                  </Button>
                ) : null}
                {row.isDefaultEnvOperator && !row.accountDisabled ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onDisableDefaultOperator(row.id)}
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
    </div>
  );

  const superadmins = sorted.filter(r => r.role === "superadmin");
  const platformOnly = sorted.filter(r => r.role !== "superadmin" && r.organizationId == null);
  const byOrg = sorted.filter(r => r.role !== "superadmin" && r.organizationId != null);

  const orgGroups = new Map<string, EditableUserRow[]>();
  for (const r of byOrg) {
    const key = `${r.organizationName ?? "Organization"} (ID ${r.organizationId ?? "—"})`;
    const arr = orgGroups.get(key) ?? [];
    arr.push(r);
    orgGroups.set(key, arr);
  }

  return (
    <div className="space-y-5">
      <div className="sticky top-2 z-10 rounded-xl border border-border/50 bg-background/70 backdrop-blur p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2 flex-1">
          <Label htmlFor="user-filter">Filter</Label>
          <Input
            id="user-filter"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by email, name, org, role, status, id…"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-2">
            <Label>Sort</Label>
            <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="orgThenEmail">Org → email</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="id">ID</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Checkbox id="user-grouped" checked={grouped} onCheckedChange={c => setGrouped(c === true)} />
            <Label htmlFor="user-grouped" className="text-sm font-normal cursor-pointer">
              Group by organization
            </Label>
          </div>
        </div>
      </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing <span className="tabular-nums">{sorted.length}</span> of{" "}
            <span className="tabular-nums">{rows.length}</span> users
          </span>
          {q ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setQuery("")}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {!grouped ? (
        <Section title="All users" count={sorted.length}>
          {renderRows(sorted)}
        </Section>
      ) : (
        <div className="grid gap-4">
          <Section title="Superadmins" count={superadmins.length}>
            {superadmins.length ? renderRows(superadmins) : <p className="text-sm text-muted-foreground">—</p>}
          </Section>

          <Section title="Users without workspace" count={platformOnly.length}>
            {platformOnly.length ? renderRows(platformOnly) : <p className="text-sm text-muted-foreground">—</p>}
          </Section>

          <Card className="border-border/50 bg-card/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Organizations</CardTitle>
                <Badge variant="secondary" className="font-normal tabular-nums">
                  {orgGroups.size}
                </Badge>
              </div>
              <CardDescription>Expand an organization to view and manage its users.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {orgGroups.size === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <Accordion type="multiple" className="rounded-lg border border-border/50">
                  {Array.from(orgGroups.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([label, groupRows]) => (
                      <AccordionItem key={label} value={label} className="px-4">
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex flex-1 items-center justify-between gap-3">
                            <span className="text-sm font-medium">{label}</span>
                            <Badge variant="outline" className="font-normal tabular-nums">
                              {groupRows.length}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          {renderRows(groupRows)}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </div>
      )}
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

  const requestPasswordReset = trpc.auth.requestPasswordReset.useMutation({
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
    onError: err => toast.error(err.message),
  });

  const [newOrgName, setNewOrgName] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignOrgId, setAssignOrgId] = useState("");
  const [assignRole, setAssignRole] = useState<"owner" | "member">("member");
  const [openUserPicker, setOpenUserPicker] = useState(false);

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

  const [activeTab, setActiveTab] = useState<
    "overview" | "organizations" | "plans" | "users" | "app"
  >("overview");

  const goTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setLocation(`/app/superadmin?tab=${tab}`);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (
      tab === "overview" ||
      tab === "organizations" ||
      tab === "plans" ||
      tab === "users" ||
      tab === "app"
    ) {
      setActiveTab(tab);
    }
  }, []);

  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editingOrgName, setEditingOrgName] = useState("");

  const updateOrg = trpc.platform.updateOrganization.useMutation({
    onSuccess: () => {
      toast.success("Organization updated.");
      setEditingOrgId(null);
      setEditingOrgName("");
      void utils.platform.overview.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const startEditOrg = (orgId: number, currentName: string) => {
    setEditingOrgId(orgId);
    setEditingOrgName(currentName);
  };

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

        <Tabs value={activeTab} onValueChange={v => goTab(v as any)} className="gap-6">
          <TabsList className="flex flex-wrap h-auto min-h-9 w-full sm:w-fit gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="users">Users & access</TabsTrigger>
            <TabsTrigger value="app">App configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Organizations"
                value={t?.organizations ?? 0}
                icon={Building2}
                onClick={() => goTab("organizations")}
              />
              <StatCard title="Users" value={t?.users ?? 0} icon={Users} onClick={() => goTab("users")} />
              <StatCard
                title="Contacts (ALL ORGS)"
                value={t?.contacts ?? 0}
                icon={BarChart3}
                onClick={() => setLocation("/app/contacts")}
              />
              <StatCard
                title="Campaigns (ALL ORGS)"
                value={t?.campaigns ?? 0}
                icon={Mail}
                onClick={() => setLocation("/app/campaigns")}
              />
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

          <TabsContent value="organizations" className="space-y-6 mt-4">
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Create organization</CardTitle>
                </div>
                <CardDescription>Creates an empty workspace.</CardDescription>
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
                  <CardTitle className="text-lg">Workspace membership</CardTitle>
                </div>
                <CardDescription>
                  Assign users to an organization and set owner vs member. Removing from a workspace clears
                  org access (they keep their platform login).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>User</Label>
                    <Popover open={openUserPicker} onOpenChange={setOpenUserPicker}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={openUserPicker}
                          className="w-full justify-between"
                          disabled={platformUsers.isLoading || platformUsers.isError}
                        >
                          {(() => {
                            const uid = assignUserId ? Number(assignUserId) : null;
                            const row = uid
                              ? (platformUsers.data ?? []).find((u: any) => u.id === uid)
                              : null;
                            if (!row) return "Search users…";
                            const label = row.email ?? row.openId;
                            return `${row.name ?? label} (${label})`;
                          })()}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search by name or email…" />
                          <CommandList>
                            <CommandEmpty>No user found.</CommandEmpty>
                            <CommandGroup>
                              {(platformUsers.data ?? []).map((u: any) => {
                                const label = u.email ?? u.openId;
                                const selected = assignUserId && Number(assignUserId) === u.id;
                                return (
                                  <CommandItem
                                    key={u.id}
                                    value={`${u.id} ${u.name ?? ""} ${label} ${u.organizationName ?? ""}`}
                                    onSelect={() => {
                                      setAssignUserId(String(u.id));
                                      setOpenUserPicker(false);
                                    }}
                                  >
                                    <Check className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`} />
                                    <div className="flex flex-col">
                                      <span className="text-sm">{u.name ?? label}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {label}
                                        {u.organizationName ? ` · ${u.organizationName}` : ""}
                                      </span>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <Select
                      value={assignOrgId || "__none"}
                      onValueChange={v => setAssignOrgId(v === "__none" ? "" : v)}
                    >
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
                    <p className="text-sm font-medium">Members in selected organization</p>
                    {orgMembers.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading members…</p>
                    ) : orgMembers.isError ? (
                      <p className="text-sm text-destructive">{orgMembers.error.message}</p>
                    ) : (orgMembers.data ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users in this organization yet.</p>
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

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Organizations</CardTitle>
                <CardDescription>Edit organization information.</CardDescription>
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
                        <TableHead className="text-right">Members</TableHead>
                        <TableHead className="text-right">Contacts</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgs.map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-muted-foreground">{o.id}</TableCell>
                          <TableCell className="font-medium">
                            {editingOrgId === o.id ? (
                              <Input
                                value={editingOrgName}
                                onChange={e => setEditingOrgName(e.target.value)}
                                className="h-8 max-w-[280px]"
                                autoComplete="off"
                              />
                            ) : (
                              o.name
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{o.memberCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{o.contactCount}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(o.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingOrgId === o.id ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={updateOrg.isPending || editingOrgName.trim().length < 2}
                                  onClick={() =>
                                    updateOrg.mutate({
                                      organizationId: o.id,
                                      name: editingOrgName.trim(),
                                    })
                                  }
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={updateOrg.isPending}
                                  onClick={() => {
                                    setEditingOrgId(null);
                                    setEditingOrgName("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => startEditOrg(o.id, o.name)}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plans" className="space-y-6 mt-4">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Plans</CardTitle>
                <CardDescription>Manage subscription plans per organization.</CardDescription>
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
                        <TableHead>Organization</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">Members</TableHead>
                        <TableHead className="text-right">Contacts</TableHead>
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
                              <SelectTrigger className="h-8 w-[200px]">
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
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
                  <UsersTable
                    rows={(platformUsers.data ?? []) as EditableUserRow[]}
                    onEdit={openEdit}
                    onGrantSuperadmin={id => grantSuperadmin.mutate({ userId: id })}
                    onDisableDefaultOperator={id => disableSeededOperator.mutate({ userId: id })}
                    busy={grantSuperadmin.isPending || disableSeededOperator.isPending || updateUser.isPending}
                  />
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
                <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Sign-in</p>
                    {String(editing.openId ?? "").startsWith("firebase:") ? (
                      <Badge variant="secondary" className="font-normal">
                        Firebase linked
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">OpenId</span>
                      <span className="font-mono text-xs text-foreground truncate max-w-[240px]">
                        {editing.openId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Login method</span>
                      <span className="text-xs text-foreground">{editing.openId.startsWith("firebase:") ? "firebase" : "password / oauth"}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">
                        Password reset emails are only sent when the account uses password sign-in.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={requestPasswordReset.isPending || !(editing.email ?? editEmail)?.trim()}
                        onClick={() => {
                          const loginId = (editing.email ?? editEmail).trim().toLowerCase();
                          requestPasswordReset.mutate({ loginId });
                        }}
                      >
                        {requestPasswordReset.isPending ? "Sending…" : "Send reset code"}
                      </Button>
                    </div>
                    {editing.openId.startsWith("firebase:") ? (
                      <p className="text-xs text-muted-foreground">
                        To disable/enable Firebase access for this user, use the <span className="font-medium text-foreground">Account disabled</span> toggle.
                      </p>
                    ) : null}
                  </div>
                </div>
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
