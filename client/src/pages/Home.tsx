import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Mail, BarChart3, TrendingUp, ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { TrendsChart } from "@/components/dashboard/TrendsChart";
import { Funnel } from "@/components/dashboard/Funnel";
import { StageBreakdown } from "@/components/dashboard/StageBreakdown";
import { TopCampaignsTable } from "@/components/dashboard/TopCampaignsTable";
import {
  CustomizeDashboardDialog,
  type DashboardSectionsState,
} from "@/components/dashboard/CustomizeDashboardDialog";
import type { DashboardSectionKey } from "@/components/dashboard/CustomizeDashboardDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function StatCard({ title, value, sub, icon: Icon, color }: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover:border-primary/30 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-3xl font-bold mt-1 text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const serverPrefsQuery = trpc.settings.getDashboardPrefs.useQuery();
  const serverPrefs = serverPrefsQuery.data;
  const savePrefsMutation = trpc.settings.setDashboardPrefs.useMutation();

  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(7);
  const defaultSections: DashboardSectionsState = {
    trends: false,
    funnel: false,
    pipeline: false,
    deliverability: false,
    topCampaigns: false,
    needsAttention: false,
    quickActions: true,
  };
  const defaultOrder: DashboardSectionKey[] = [
    "quickActions",
    "trends",
    "funnel",
    "pipeline",
    "deliverability",
    "topCampaigns",
    "needsAttention",
  ];
  const [sections, setSections] = useState<DashboardSectionsState>(defaultSections);
  const [sectionOrder, setSectionOrder] = useState<DashboardSectionKey[]>(defaultOrder);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const lastSavedRangeRef = useRef<7 | 30 | 90 | null>(null);

  useEffect(() => {
    // One-time initialization: prefer server prefs, else fall back to localStorage.
    if (prefsLoaded) return;
    // Wait for the server prefs query to resolve before falling back.
    if (!serverPrefsQuery.isFetched) return;

    const applyOrder = (incoming: string[] | undefined | null) => {
      const asKeys = (incoming ?? []).filter((x): x is DashboardSectionKey =>
        x === "quickActions" ||
        x === "trends" ||
        x === "funnel" ||
        x === "pipeline" ||
        x === "deliverability" ||
        x === "topCampaigns" ||
        x === "needsAttention"
      );
      const merged = [...asKeys, ...defaultOrder.filter(k => !asKeys.includes(k))];
      setSectionOrder(asKeys.length ? merged : defaultOrder);
    };

    if (serverPrefs) {
      const n = Number(serverPrefs.rangeDays);
      if (n === 7 || n === 30 || n === 90) setRangeDays(n);
      setSections({ ...defaultSections, ...(serverPrefs.sections ?? {}) });
      applyOrder(serverPrefs.sectionOrder);
      setPrefsLoaded(true);
      return;
    }

    // Fallback until the user hits Save (then it will be stored server-side)
    try {
      const rawRange = window.localStorage.getItem("dashboardRangeDays");
      const n = Number(rawRange);
      if (n === 7 || n === 30 || n === 90) setRangeDays(n);
      const rawSections = window.localStorage.getItem("dashboardSections");
      if (rawSections) {
        const parsed = JSON.parse(rawSections) as Partial<DashboardSectionsState>;
        setSections({ ...defaultSections, ...parsed });
      }
      const rawOrder = window.localStorage.getItem("dashboardSectionOrder");
      if (rawOrder) {
        const parsed = JSON.parse(rawOrder) as unknown;
        if (Array.isArray(parsed)) applyOrder(parsed as string[]);
      }
    } catch {
      // ignore storage failures
    }
    setPrefsLoaded(true);
  }, [serverPrefs, serverPrefsQuery.isFetched, prefsLoaded, defaultOrder, defaultSections]);

  useEffect(() => {
    if (!prefsLoaded) return;
    if (lastSavedRangeRef.current == null) {
      // initialize cursor after initial prefs load
      lastSavedRangeRef.current = rangeDays;
      return;
    }
    if (lastSavedRangeRef.current === rangeDays) return;
    lastSavedRangeRef.current = rangeDays;
    savePrefsMutation.mutate({
      rangeDays,
      sections,
      sectionOrder,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays, prefsLoaded]);

  const { data: overview } = trpc.dashboard.overview.useQuery({ rangeDays });
  const { data: positiveAlert } = trpc.campaigns.newPositiveReplies.useQuery();
  const ackPositiveMutation = trpc.campaigns.acknowledgePositiveReplies.useMutation();

  const totalContacts = overview?.pipelineStages.reduce((sum, r) => sum + r.count, 0) ?? 0;
  const totalSent = overview?.funnel.sent ?? 0;
  const uniqueOpens = overview?.funnel.opened ?? 0;
  const openRate = overview?.funnel.rates.openRate ?? 0;
  const uniqueReplies = overview?.funnel.replied ?? 0;
  const bounceRate = overview?.deliverability.bounceRate ?? 0;

  const renderSectionCard = (key: DashboardSectionKey) => {
    if (!sections[key]) return null;

    if (key === "quickActions") {
      return (
        <Card key={key} className="border-border/50 bg-card/80 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: Users, color: "bg-blue-500/20 text-blue-400", title: "Import Contacts", sub: "Upload Apollo/LinkedIn CSV export", path: "/app/contacts" },
              { icon: Mail, color: "bg-primary/20 text-primary", title: "Build a Sequence", sub: "Create multi-step email campaigns", path: "/app/campaigns" },
              { icon: TrendingUp, color: "bg-emerald-500/20 text-emerald-400", title: "Review Signals", sub: "Fresh intent + activity signals", path: "/app/signals" },
              { icon: BarChart3, color: "bg-purple-500/20 text-purple-400", title: "Prospecting", sub: "Find and enrich new leads", path: "/app/prospecting" },
              { icon: CheckCircle2, color: "bg-amber-500/20 text-amber-300", title: "Connect Mailboxes", sub: "Set up Google/Microsoft/SMTP", path: "/app/settings?tab=smtp" },
              { icon: CheckCircle2, color: "bg-slate-500/20 text-slate-300", title: "Workspace Settings", sub: "Organization + subscription settings", path: "/app/settings?tab=organization" },
            ].map(({ icon: Icon, color, title, sub, path }) => (
              <button key={path} onClick={() => setLocation(path)} className="w-full flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left group">
                <div className={`p-2 rounded-lg ${color} transition-colors`}><Icon className="h-4 w-4" /></div>
                <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{sub}</p></div>
                <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
              </button>
            ))}
          </CardContent>
        </Card>
      );
    }

    if (key === "trends") {
      return (
        <Card key={key} className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Trends (last {rangeDays} days)</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendsChart data={overview?.timeseries ?? []} />
          </CardContent>
        </Card>
      );
    }

    if (key === "funnel") {
      return (
        <Card key={key} className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <Funnel
              sent={overview?.funnel.sent ?? 0}
              opened={overview?.funnel.opened ?? 0}
              replied={overview?.funnel.replied ?? 0}
              positive={overview?.funnel.positive ?? 0}
            />
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <p><span className="font-medium text-foreground">{overview?.funnel.rates.replyRate ?? 0}%</span> reply rate</p>
              <p><span className="font-medium text-foreground">{overview?.funnel.rates.positiveOfRepliesRate ?? 0}%</span> positive of replies</p>
              <p><span className="font-medium text-foreground">{bounceRate}%</span> bounce rate</p>
              <p><span className="font-medium text-foreground">{overview?.deliverability.unsubscribes ?? 0}</span> unsubscribes</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (key === "pipeline") {
      return (
        <Card key={key} className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Pipeline by stage</CardTitle>
          </CardHeader>
          <CardContent>
            <StageBreakdown data={overview?.pipelineStages ?? []} />
          </CardContent>
        </Card>
      );
    }

    if (key === "deliverability") {
      return (
        <Card key={key} className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Deliverability health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Bounce rate</p>
                <p className="text-xl font-semibold mt-1">{bounceRate}%</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Unsubscribes ({rangeDays}d)</p>
                <p className="text-xl font-semibold mt-1">{overview?.deliverability.unsubscribes ?? 0}</p>
              </div>
            </div>
            {overview?.deliverability.bouncesByProvider?.length ? (
              <div className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">Bounces by provider:</span>{" "}
                {overview.deliverability.bouncesByProvider.map(x => `${x.provider}: ${x.count}`).join(", ")}
              </div>
            ) : null}
            {overview?.deliverability.unsubscribesByProvider?.length ? (
              <div className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">Unsubs by provider:</span>{" "}
                {overview.deliverability.unsubscribesByProvider.map(x => `${x.provider}: ${x.count}`).join(", ")}
              </div>
            ) : null}
          </CardContent>
        </Card>
      );
    }

    if (key === "topCampaigns") {
      return (
        <Card key={key} className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Top campaigns ({rangeDays}d)</CardTitle>
          </CardHeader>
          <CardContent>
            <TopCampaignsTable title="Best performers" rows={overview?.topCampaigns ?? []} onOpen={(id) => setLocation(`/app/campaigns/${id}`)} />
          </CardContent>
        </Card>
      );
    }

    if (key === "needsAttention") {
      return (
        <Card key={key} className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Needs attention ({rangeDays}d)</CardTitle>
          </CardHeader>
          <CardContent>
            <TopCampaignsTable title="Highest bounce / lowest reply" rows={overview?.worstCampaigns ?? []} onOpen={(id) => setLocation(`/app/campaigns/${id}`)} />
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 p-2">
        {positiveAlert && positiveAlert.count > 0 ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-emerald-100">
              You have <span className="font-semibold">{positiveAlert.count}</span> new positive{" "}
              {positiveAlert.count === 1 ? "reply" : "replies"}.
            </p>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => {
                  const first = positiveAlert.campaigns[0];
                  if (first) {
                    setLocation(`/app/campaigns/${first.campaignId}?tab=responses`);
                  }
                  ackPositiveMutation.mutate();
                }}
              >
                View in sequence
              </Button>
              <Button size="sm" variant="ghost" onClick={() => ackPositiveMutation.mutate()}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground mt-1">Here's an overview of your pipeline.</p>
          </div>
          <div className="flex gap-2 items-center">
            <CustomizeDashboardDialog
              value={sections}
              order={sectionOrder}
              onSave={({ sections: nextSections, order: nextOrder }) => {
                setSections(nextSections);
                setSectionOrder(nextOrder);
                savePrefsMutation.mutate({
                  rangeDays,
                  sections: nextSections,
                  sectionOrder: nextOrder,
                });
              }}
              onResetDefaults={() => ({ sections: defaultSections, order: defaultOrder })}
            />
            <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(v === "90" ? 90 : v === "30" ? 30 : 7)}>
              <SelectTrigger size="sm" className="min-w-[108px]">
                <SelectValue placeholder="Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/app/contacts")}
            >
              <Users className="h-4 w-4 mr-2" />Contacts
            </Button>
            <Button
              size="sm"
              onClick={() => setLocation("/app/campaigns")}
              className="bg-primary text-primary-foreground"
            >
              <Mail className="h-4 w-4 mr-2" />New Campaign
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Contacts" value={totalContacts.toLocaleString()} sub="in pipeline" icon={Users} color="bg-blue-500/20 text-blue-400" />
          <StatCard title={`Replies (${rangeDays}d)`} value={uniqueReplies.toLocaleString()} sub={`${overview?.funnel.rates.replyRate ?? 0}% reply rate`} icon={Mail} color="bg-primary/20 text-primary" />
          <StatCard title={`Emails Sent (${rangeDays}d)`} value={totalSent.toLocaleString()} sub={`in last ${rangeDays} days`} icon={BarChart3} color="bg-purple-500/20 text-purple-400" />
          <StatCard
            title="Open Rate"
            value={`${openRate}%`}
            sub={`${uniqueOpens} unique opens${overview?.deliverability.opensByProvider?.length ? ` · ${overview.deliverability.opensByProvider.map(x => `${x.provider}: ${x.count}`).join(", ")}` : ""}`}
            icon={TrendingUp}
            color="bg-emerald-500/20 text-emerald-400"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sectionOrder.map(renderSectionCard)}
        </div>
      </div>
    </DashboardLayout>
  );
}
