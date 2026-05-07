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
import { BarChart3, Building2, Check, CheckCircle2, ChevronsUpDown, Mail, Pencil, Settings2, Trash2, UserPlus, Users, XCircle } from "lucide-react";
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
  onDelete,
  canDelete,
  busy,
}: {
  rows: EditableUserRow[];
  onEdit: (row: EditableUserRow) => void;
  onGrantSuperadmin: (userId: number) => void;
  onDisableDefaultOperator: (userId: number) => void;
  onDelete: (row: EditableUserRow) => void;
  canDelete: boolean;
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
                {canDelete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onDelete(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
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
  const appConfig = trpc.settings.getAppConfig.useQuery(undefined, {
    enabled: canOperate,
    retry: false,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<EditableUserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin" | "superadmin">("user");
  const [editDisabled, setEditDisabled] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<EditableUserRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const openEdit = (row: EditableUserRow) => {
    setEditing(row);
    setEditName(row.name ?? "");
    setEditEmail(row.email ?? "");
    setEditRole(row.role);
    setEditDisabled(row.accountDisabled);
    setEditOpen(true);
  };

  const openDelete = (row: EditableUserRow) => {
    setDeleting(row);
    setDeleteConfirm("");
    setDeleteOpen(true);
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

  const deleteUser = trpc.platform.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("User deleted.");
      void utils.platform.users.invalidate();
      void utils.platform.overview.invalidate();
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
    "overview" | "organizations" | "plans" | "users" | "prospect_db" | "app"
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
      tab === "prospect_db" ||
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
            <TabsTrigger value="prospect_db">Prospect DB</TabsTrigger>
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
                    onDelete={openDelete}
                    canDelete={user?.role === "superadmin"}
                    busy={
                      grantSuperadmin.isPending ||
                      disableSeededOperator.isPending ||
                      updateUser.isPending ||
                      deleteUser.isPending
                    }
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prospect_db" className="space-y-4 mt-4">
            <ProspectDbPanel />
          </TabsContent>

          <TabsContent value="app" className="space-y-4 mt-4">
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Platform info</CardTitle>
                </div>
                <CardDescription>Current configuration overview.</CardDescription>
              </CardHeader>
              <CardContent>
                {appConfig.isLoading ? (
                  <p className="text-sm text-muted-foreground py-6">Loading…</p>
                ) : appConfig.isError ? (
                  <p className="text-sm text-destructive">{appConfig.error.message}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: "App Base URL", value: appConfig.data?.appBaseUrl || "Not set" },
                      { label: "SMTP", value: appConfig.data?.smtpConfigured ? "Configured" : "Not configured", ok: appConfig.data?.smtpConfigured },
                      { label: "Email Tracking", value: appConfig.data?.appBaseUrl ? "Enabled (pixel tracking)" : "Needs APP_BASE_URL" },
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
                )}
              </CardContent>
            </Card>

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

        <Dialog
          open={deleteOpen}
          onOpenChange={open => {
            setDeleteOpen(open);
            if (!open) {
              setDeleting(null);
              setDeleteConfirm("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete user</DialogTitle>
              <DialogDescription>
                This permanently removes the user record. Type{" "}
                <span className="font-medium text-foreground">delete</span> to confirm.
              </DialogDescription>
            </DialogHeader>
            {deleting ? (
              <div className="space-y-4 py-2">
                <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm">
                  <p className="font-medium truncate">
                    {deleting.name ?? deleting.email ?? deleting.openId}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    id {deleting.id} · {deleting.email ?? deleting.openId} · role {deleting.role}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-delete-confirm">Confirmation</Label>
                  <Input
                    id="su-delete-confirm"
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder='Type "delete"'
                    autoComplete="off"
                  />
                </div>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={deleteUser.isPending}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  !deleting ||
                  deleteUser.isPending ||
                  deleteConfirm.trim().toLowerCase() !== "delete"
                }
                onClick={() => {
                  if (!deleting) return;
                  deleteUser.mutate({ userId: deleting.id });
                  setDeleteOpen(false);
                  setDeleting(null);
                  setDeleteConfirm("");
                }}
              >
                {deleteUser.isPending ? "Deleting…" : "Delete user"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Prospect DB panel (superadmin only)                                    */
/* ────────────────────────────────────────────────────────────────────── */

const PROSPECT_SOURCE_LABELS: Record<string, string> = {
  wikidata: "Wikidata",
  sec_edgar: "SEC EDGAR",
  uk_ch: "UK Companies House",
  linkedin_serp: "LinkedIn (SERP)",
  website: "Company website",
  user_import: "User CSV imports",
  unknown: "Unknown",
};

const PROSPECT_QUEUE_KIND_LABELS: Record<string, string> = {
  resolve_domain: "Resolve domain",
  crawl_website: "Crawl website",
  guess_emails: "Guess emails",
  verify_mx: "Verify MX",
  harvest_employee: "Harvest employees",
};

function ProspectDbPanel() {
  const utils = trpc.useUtils();
  const overview = trpc.prospectSearch.platformOverview.useQuery();
  const initialize = trpc.prospectSearch.initializePlatform.useMutation({
    onSuccess: async (res) => {
      toast.success(
        `Prospect init done. Imported ${res.importedCompanies}, queued ${res.enqueuedJobs}, ticks: seeds ${res.ticks.seeds.processed}/${res.ticks.seeds.errors} errors.`,
      );
      await Promise.all([
        utils.prospectSearch.platformOverview.invalidate(),
        utils.prospectSearch.platformContacts.invalidate(),
      ]);
    },
    onError: err => toast.error(err.message),
  });
  const [scope, setScope] = useState<"employees" | "companies">("employees");
  const [browserQ, setBrowserQ] = useState("");
  const [browserSource, setBrowserSource] = useState<string>("any");
  const [browserEmail, setBrowserEmail] = useState<string>("any");
  const [browserCursor, setBrowserCursor] = useState(0);
  const [importBootstrap, setImportBootstrap] = useState(true);

  const browser = trpc.prospectSearch.platformContacts.useQuery({
    scope,
    q: browserQ || undefined,
    sources: browserSource && browserSource !== "any" ? [browserSource as any] : undefined,
    emailFilter: scope === "employees" ? (browserEmail as any) : undefined,
    cursor: browserCursor,
    limit: 50,
  });

  if (overview.isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading prospect database…</p>;
  }
  if (overview.isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base">Could not load Prospect DB</CardTitle>
          <CardDescription>{overview.error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const data = overview.data;
  if (!data) return null;

  const t = data.totals;
  const companiesGrowthTotal = data.growth.companies.reduce((s, r) => s + r.count, 0);
  const employeesGrowthTotal = data.growth.employees.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Initialization</CardTitle>
          <CardDescription>
            If Prospect DB is empty, seed crawl sources and optionally import the 1,000-company bootstrap CSV,
            then run one immediate crawler cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox
              checked={importBootstrap}
              onCheckedChange={v => setImportBootstrap(v === true)}
            />
            Import bootstrap CSV (`scripts/bootstrap_companies_1000_with_domains.csv`)
          </label>
          <Button
            onClick={() =>
              initialize.mutate({
                importBootstrapCsv: importBootstrap,
                runTicks: true,
              })
            }
            disabled={initialize.isPending}
          >
            {initialize.isPending ? "Running…" : "Initialize & Run Crawler Now"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              initialize.mutate({
                importBootstrapCsv: false,
                runTicks: true,
              })
            }
            disabled={initialize.isPending}
          >
            Run Ticks Only
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ProspectStat label="Companies" value={t.companies} hint={`${t.companiesActive.toLocaleString()} active`} />
        <ProspectStat
          label="Domains resolved"
          value={t.companiesWithDomain}
          hint={`${pct(t.companiesWithDomain, t.companies)} of catalogue`}
        />
        <ProspectStat
          label="Domains verified"
          value={t.companiesVerified}
          hint={`${pct(t.companiesVerified, t.companiesWithDomain)} of resolved`}
        />
        <ProspectStat
          label="LinkedIn pages"
          value={t.companiesWithLinkedin}
          hint={`${pct(t.companiesWithLinkedin, t.companies)} of catalogue`}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ProspectStat label="People" value={t.employees} />
        <ProspectStat
          label="With work emails"
          value={t.employeesWithEmail}
          hint={`${pct(t.employeesWithEmail, t.employees)} MX-verified`}
        />
        <ProspectStat
          label="With LinkedIn"
          value={t.employeesWithLinkedin}
          hint={`${pct(t.employeesWithLinkedin, t.employees)} of people`}
        />
        <ProspectStat
          label="Last 14 days growth"
          value={companiesGrowthTotal + employeesGrowthTotal}
          hint={`${companiesGrowthTotal.toLocaleString()} companies + ${employeesGrowthTotal.toLocaleString()} people`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Growth (last 14 days)</CardTitle>
            <CardDescription>New companies and people discovered per day.</CardDescription>
          </CardHeader>
          <CardContent>
            <GrowthSpark
              companies={data.growth.companies}
              employees={data.growth.employees}
            />
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Source mix</CardTitle>
            <CardDescription>Where rows are coming from.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SourceList title="Companies" rows={data.bySource.companies} />
            <SourceList title="People" rows={data.bySource.employees} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Top regions</CardTitle>
            <CardDescription>Active companies by HQ country (top 30).</CardDescription>
          </CardHeader>
          <CardContent>
            <TwoColList rows={data.byCountry.map(r => ({ key: r.country ?? "—", count: r.count }))} />
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Industries</CardTitle>
            <CardDescription>Active companies by industry code (top 20).</CardDescription>
          </CardHeader>
          <CardContent>
            <TwoColList rows={data.byIndustry.map(r => ({ key: r.industryCode ?? "—", count: r.count }))} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Headcount distribution</CardTitle>
            <CardDescription>Active companies grouped by employee band.</CardDescription>
          </CardHeader>
          <CardContent>
            <TwoColList rows={data.byHeadcountBand.map(r => ({ key: r.band ?? "—", count: r.count }))} />
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Seniority mix</CardTitle>
            <CardDescription>People by inferred seniority level.</CardDescription>
          </CardHeader>
          <CardContent>
            <TwoColList
              rows={data.bySeniority.map(r => ({
                key: prettySeniority(r.level),
                count: r.count,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Crawl queue</CardTitle>
          <CardDescription>Pipeline depth for the autonomous crawler.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["pending", "in_flight", "done", "dead"] as const).map(status => {
              const row = data.queue.byStatus.find(r => r.status === status);
              return (
                <div key={status} className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground capitalize">{status.replace("_", " ")}</p>
                  <p className="text-2xl font-semibold tabular-nums mt-1">{row?.count.toLocaleString() ?? 0}</p>
                </div>
              );
            })}
          </div>
          {data.queue.byKind.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.queue.byKind.map((r, i) => (
                  <TableRow key={`${r.kind}-${r.status}-${i}`}>
                    <TableCell>{PROSPECT_QUEUE_KIND_LABELS[r.kind ?? ""] ?? r.kind}</TableCell>
                    <TableCell className="capitalize">{(r.status ?? "").replace("_", " ")}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.count.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Queue is empty.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Recent crawl runs</CardTitle>
            <CardDescription>Last 20 source executions.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No crawler runs yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Found / New</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentRuns.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.startedAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{r.kind}</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.status === "ok" ? "secondary" : r.status === "throttled" ? "outline" : "destructive"}
                          className="text-[10px]"
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {r.itemsFound} / {r.itemsNew}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Daily HTTP / SERP budget</CardTitle>
            <CardDescription>Consumption tracked per UTC day.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.budget.length === 0 ? (
              <p className="text-sm text-muted-foreground">No budget consumed yet today.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Consumed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.budget.map((b: any) => (
                    <TableRow key={`${b.bucketDay}-${b.bucketKind}`}>
                      <TableCell className="text-xs">{b.bucketDay}</TableCell>
                      <TableCell className="text-xs uppercase">{b.bucketKind}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {b.consumed.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Crawl seeds health</CardTitle>
          <CardDescription>
            Seeds with consecutive errors {">="} 5 are auto-disabled by the scheduler.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.seedHealth.length === 0 ? (
            <p className="text-sm text-muted-foreground">No seeds defined.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.seedHealth.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{s.kind}</TableCell>
                    <TableCell className="text-xs">{s.region}</TableCell>
                    <TableCell>
                      <Badge
                        variant={s.enabled ? "secondary" : "destructive"}
                        className="text-[10px]"
                      >
                        {s.enabled ? "enabled" : "disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {s.consecutiveErrors}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Browse catalogue</CardTitle>
          <CardDescription>
            Inspect rows directly. Use this to spot-check growth and quality across the global
            prospect tables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Tabs value={scope} onValueChange={v => { setScope(v as "employees" | "companies"); setBrowserCursor(0); }}>
              <TabsList>
                <TabsTrigger value="employees">People</TabsTrigger>
                <TabsTrigger value="companies">Companies</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Search</Label>
              <Input
                value={browserQ}
                onChange={e => { setBrowserQ(e.target.value); setBrowserCursor(0); }}
                placeholder={scope === "companies" ? "Company name…" : "Person or title…"}
                className="h-9"
              />
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs">Source</Label>
              <Select value={browserSource} onValueChange={v => { setBrowserSource(v); setBrowserCursor(0); }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any source</SelectItem>
                  {Object.entries(PROSPECT_SOURCE_LABELS).map(([code, label]) => (
                    <SelectItem key={code} value={code}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scope === "employees" ? (
              <div className="min-w-[160px]">
                <Label className="text-xs">Email status</Label>
                <Select value={browserEmail} onValueChange={v => { setBrowserEmail(v); setBrowserCursor(0); }}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="with_email">With work email</SelectItem>
                    <SelectItem value="without_email">Email unknown</SelectItem>
                    <SelectItem value="mx_absent">Domain has no MX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {browser.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : browser.isError ? (
            <p className="text-sm text-destructive">{browser.error?.message}</p>
          ) : (browser.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No rows match.</p>
          ) : scope === "employees" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(browser.data?.items as any[]).map(emp => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.fullName}</TableCell>
                    <TableCell className="text-xs">{emp.title ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {emp.company?.name ?? "—"}
                      {emp.company?.domain ? <span className="text-muted-foreground"> · {emp.company.domain}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {emp.email ? (
                        <span className={emp.emailStatus === "mx_present" ? "text-foreground" : "text-muted-foreground"}>
                          {emp.email}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{emp.emailStatus}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{PROSPECT_SOURCE_LABELS[emp.source] ?? emp.source}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(emp.firstSeenAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>HQ</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(browser.data?.items as any[]).map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs">{c.domain ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {[c.hqCity, c.hqAdmin1, c.hqCountry].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{c.industryCode ?? "—"}</TableCell>
                    <TableCell className="text-xs">{c.headcountBand ?? "—"}</TableCell>
                    <TableCell className="text-xs">{PROSPECT_SOURCE_LABELS[c.source] ?? c.source}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(c.firstSeenAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-between items-center pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={browserCursor === 0 || browser.isFetching}
              onClick={() => setBrowserCursor(c => Math.max(0, c - 50))}
            >
              ← Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Showing rows {browserCursor + 1}–{browserCursor + (browser.data?.items.length ?? 0)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!browser.data?.nextCursor || browser.isFetching}
              onClick={() => browser.data?.nextCursor != null && setBrowserCursor(browser.data.nextCursor)}
            >
              Next →
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProspectStat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="py-4 px-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums mt-1">{value.toLocaleString()}</p>
        {hint ? <p className="text-[11px] text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function SourceList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ source: string | null; count: number }>;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
        <p className="text-xs text-muted-foreground">No data yet.</p>
      </div>
    );
  }
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.source ?? "?"} className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs truncate">{PROSPECT_SOURCE_LABELS[r.source ?? ""] ?? r.source ?? "—"}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {r.count.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded">
                <div
                  className="h-full bg-primary rounded"
                  style={{ width: `${Math.round((r.count / total) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TwoColList({ rows }: { rows: Array<{ key: string; count: number }> }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  const max = Math.max(...rows.map(r => r.count), 1);
  return (
    <div className="space-y-1">
      {rows.slice(0, 30).map(r => (
        <div key={r.key} className="flex items-center gap-3">
          <span className="text-xs w-24 truncate">{r.key}</span>
          <div className="flex-1 h-2 bg-muted rounded">
            <div
              className="h-full bg-primary/70 rounded"
              style={{ width: `${Math.round((r.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs w-14 text-right tabular-nums text-muted-foreground">
            {r.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function GrowthSpark({
  companies,
  employees,
}: {
  companies: Array<{ day: string; count: number }>;
  employees: Array<{ day: string; count: number }>;
}) {
  const allDays = Array.from(new Set([...companies.map(r => r.day), ...employees.map(r => r.day)])).sort();
  const cMap = new Map(companies.map(r => [r.day, r.count]));
  const eMap = new Map(employees.map(r => [r.day, r.count]));
  if (allDays.length === 0) {
    return <p className="text-sm text-muted-foreground">No new rows in the last 14 days.</p>;
  }
  const max = Math.max(
    1,
    ...allDays.map(d => Math.max(cMap.get(d) ?? 0, eMap.get(d) ?? 0)),
  );
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1 h-24">
        {allDays.map(day => {
          const c = cMap.get(day) ?? 0;
          const e = eMap.get(day) ?? 0;
          return (
            <div key={day} className="flex-1 flex flex-col justify-end gap-0.5" title={`${day}: ${c} companies / ${e} people`}>
              <div className="bg-primary/70 rounded-sm" style={{ height: `${(c / max) * 100}%` }} />
              <div className="bg-primary/30 rounded-sm" style={{ height: `${(e / max) * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-primary/70" />
          Companies
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-primary/30" />
          People
        </span>
      </div>
    </div>
  );
}

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function prettySeniority(level: string): string {
  switch (level) {
    case "c_level":
      return "C-level";
    case "head":
      return "Head / VP";
    case "director":
      return "Director";
    case "manager":
      return "Manager / Lead";
    case "ic":
      return "Individual contributor";
    default:
      return "Unknown";
  }
}
