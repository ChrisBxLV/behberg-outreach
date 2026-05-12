import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import type { ProspectCrawlerStatusPayload } from "../../../../server/services/prospect/crawlerStatus";
import { ChevronDown, Pause, Play, RefreshCw, Square } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

/** Mirror `server/services/prospect/crawlerSettings.ts` — do not import server modules into the client bundle. */
const SCHED_MAX_MINUTES = 7 * 24 * 60;
const SCHED_MIN_SEED = 15;
const SCHED_MIN_COMPANY = 5;
const SCHED_MIN_EMPLOYEE = 15;

function prospectCrawlerStatusBadgeClass(status: string): string {
  switch (status) {
    case "running":
      return "bg-emerald-600 hover:bg-emerald-600 text-white border-transparent";
    case "stopped":
      return "bg-muted text-muted-foreground border-border";
    case "paused":
      return "bg-violet-600 hover:bg-violet-600 text-white border-transparent";
    case "has_errors":
      return "bg-destructive hover:bg-destructive text-destructive-foreground border-transparent";
    case "waiting_for_seed":
      return "bg-amber-600 hover:bg-amber-600 text-white border-transparent";
    case "budget_exhausted":
      return "bg-orange-600 hover:bg-orange-600 text-white border-transparent";
    case "idle":
    default:
      return "bg-sky-600 hover:bg-sky-600 text-white border-transparent";
  }
}

function fmtDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

type Props = {
  settingsCard: ReactNode;
};

export function ProspectCrawlerControlCenter({ settingsCard }: Props) {
  const utils = trpc.useUtils();
  const query = trpc.prospectSearch.getCrawlerStatus.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const settingsQ = trpc.prospectSearch.getCrawlerSettings.useQuery();

  const inv = async () => {
    await Promise.all([
      utils.prospectSearch.getCrawlerStatus.invalidate(),
      utils.prospectSearch.getCrawlerSettings.invalidate(),
    ]);
  };

  const startCrawler = trpc.prospectSearch.startCrawler.useMutation({
    onSuccess: async () => {
      toast.success("Crawler started (scheduler on, queue resumed).");
      await inv();
    },
    onError: e => toast.error(e.message),
  });
  const stopCrawler = trpc.prospectSearch.stopCrawler.useMutation({
    onSuccess: async () => {
      toast.success("Crawler stopped (scheduler off).");
      await inv();
    },
    onError: e => toast.error(e.message),
  });
  const pauseQueue = trpc.prospectSearch.pauseCrawlerQueue.useMutation({
    onSuccess: async () => {
      toast.success("Queue paused (scheduled company/employee ticks hold).");
      await inv();
    },
    onError: e => toast.error(e.message),
  });
  const resumeQueue = trpc.prospectSearch.resumeCrawlerQueue.useMutation({
    onSuccess: async () => {
      toast.success("Queue resumed.");
      await inv();
    },
    onError: e => toast.error(e.message),
  });
  const runSeed = trpc.prospectSearch.runCrawlerSeedTickNow.useMutation({
    onSuccess: async r => {
      toast.success(`Seed tick: ${r.processed} processed, ${r.errors} errors.`);
      if (r.manualNotice) toast.message(r.manualNotice);
      await inv();
    },
    onError: e => toast.error(e.message),
  });
  const runCompany = trpc.prospectSearch.runCrawlerCompanyTickNow.useMutation({
    onSuccess: async r => {
      toast.success(`Company queue tick: ${r.processed} processed, ${r.errors} errors.`);
      if (r.manualNotice) toast.message(r.manualNotice);
      await inv();
    },
    onError: e => toast.error(e.message),
  });
  const runEmployee = trpc.prospectSearch.runCrawlerEmployeeTickNow.useMutation({
    onSuccess: async r => {
      toast.success(`Employee queue tick: ${r.processed} processed, ${r.errors} errors.`);
      if (r.manualNotice) toast.message(r.manualNotice);
      await inv();
    },
    onError: e => toast.error(e.message),
  });
  const runFull = trpc.prospectSearch.runCrawlerFullCycleNow.useMutation({
    onSuccess: async r => {
      toast.success(
        `Full cycle: seeds ${r.seeds.processed}/${r.seeds.errors} · company ${r.queueCompany.processed}/${r.queueCompany.errors} · employee ${r.queueEmployee.processed}/${r.queueEmployee.errors}`,
      );
      if (r.manualNotice) toast.message(r.manualNotice);
      await inv();
    },
    onError: e => toast.error(e.message),
  });
  const updateSchedule = trpc.prospectSearch.updateCrawlerSchedule.useMutation({
    onSuccess: async () => {
      toast.success("Schedule saved.");
      await inv();
    },
    onError: e => toast.error(e.message),
  });

  const rt = settingsQ.data?.settings;
  const [schedOn, setSchedOn] = useState(false);
  const [seedM, setSeedM] = useState(60);
  const [coM, setCoM] = useState(10);
  const [emM, setEmM] = useState(30);

  useEffect(() => {
    if (!rt) return;
    setSchedOn(rt.schedulerEnabled);
    setSeedM(rt.seedTickIntervalMinutes);
    setCoM(rt.companyQueueTickIntervalMinutes);
    setEmM(rt.employeeQueueTickIntervalMinutes);
  }, [
    rt?.schedulerEnabled,
    rt?.seedTickIntervalMinutes,
    rt?.companyQueueTickIntervalMinutes,
    rt?.employeeQueueTickIntervalMinutes,
  ]);

  const q = query.data as ProspectCrawlerStatusPayload | undefined;
  const busyCtl =
    startCrawler.isPending ||
    stopCrawler.isPending ||
    pauseQueue.isPending ||
    resumeQueue.isPending ||
    runSeed.isPending ||
    runCompany.isPending ||
    runEmployee.isPending ||
    runFull.isPending;

  const pending = q?.queue.byStatus.find(s => s.status === "pending")?.count ?? 0;
  const done = q?.queue.byStatus.find(s => s.status === "done")?.count ?? 0;
  const lastRun = q?.recentRuns[0];
  const errorRuns = (q?.recentRuns ?? []).filter(r => r.status === "error").slice(0, 5);
  const serpLocked = q && !q.runtime.serpSourcesEnabled;

  const showWarnings =
    !!q &&
    (!q.schemaReady ||
      (q.schemaReady && q.seeds.total === 0) ||
      !q.runtime.crawlerEnabledBySettings ||
      q.runtime.disabledByEnv ||
      !q.runtime.serpSourcesEnabled ||
      q.queue.deadCount > 0);

  const activityLabel = (() => {
    if (!q) return "—";
    if (q.currentlyRunningStage === "seed") return "Scheduler: seed tick";
    if (q.currentlyRunningStage === "company") return q.queue.inFlightCount > 0 ? "Queue: company lane (in flight)" : "Scheduler: company queue tick";
    if (q.currentlyRunningStage === "employee") return q.queue.inFlightCount > 0 ? "Queue: employee lane (in flight)" : "Scheduler: employee queue tick";
    if (q.queue.inFlightCount > 0) return "Queue jobs in flight";
    if (q.derivedStatus === "paused") return "Queue paused (seeds may still be scheduled)";
    return "Idle";
  })();

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Crawler Control Center</CardTitle>
          <CardDescription>
            Operator controls for the shared Prospect DB crawler. Automatic ticks run only in the server process via
            the scheduler (not inside HTTP requests). Manual actions run one bounded tick at a time.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {q ? (
            <Badge className={prospectCrawlerStatusBadgeClass(q.derivedStatus)} variant="outline">
              {q.derivedStatus.replace(/_/g, " ")}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={query.isFetching}
            onClick={() => void inv()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading crawler status…</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{query.error.message}</p>
        ) : !q ? (
          <p className="text-sm text-muted-foreground">No status data.</p>
        ) : (
          <>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current activity</p>
                  <p className="text-sm font-medium">{activityLabel}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground space-y-0.5">
                  <p>
                    Last manual: {fmtDt(q.scheduler.lastManualRunAt)}
                    {q.scheduler.lastManualRunByUserId != null ? ` · user #${q.scheduler.lastManualRunByUserId}` : ""}
                  </p>
                  <p>
                    Last stop: {fmtDt(q.scheduler.lastStopAt)}
                    {q.scheduler.lastStopByUserId != null ? ` · user #${q.scheduler.lastStopByUserId}` : ""}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Next seed tick</p>
                  <p className="font-medium">{fmtDt(q.scheduler.nextSeedTickAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Next company queue</p>
                  <p className="font-medium">{fmtDt(q.scheduler.nextCompanyQueueTickAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Next employee queue</p>
                  <p className="font-medium">{fmtDt(q.scheduler.nextEmployeeQueueTickAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">HTTP budget today</p>
                  <p className="font-medium">
                    {q.budget.http.consumed} / {q.budget.http.cap}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground border-t border-border/50 pt-3">
                <span>
                  Pending: <span className="text-foreground font-medium">{pending.toLocaleString()}</span>
                </span>
                <span>
                  In flight: <span className="text-foreground font-medium">{q.queue.inFlightCount.toLocaleString()}</span>
                </span>
                <span>
                  Dead: <span className="text-foreground font-medium">{q.queue.deadCount.toLocaleString()}</span> · Done:{" "}
                  <span className="text-foreground font-medium">{done.toLocaleString()}</span>
                </span>
              </div>
            </div>

            {showWarnings ? (
              <div className="rounded-md border border-amber-600/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200/90 space-y-1">
                {!q.schemaReady ? (
                  <p>Prospect crawler tables are missing or unreachable. Run migrations before using the crawler.</p>
                ) : null}
                {q.schemaReady && q.seeds.total === 0 ? (
                  <p>
                    <span className="font-medium">Initialize prospect data first.</span> There are no rows in{" "}
                    <span className="font-mono">prospect_crawl_seeds</span> yet.
                  </p>
                ) : null}
                {!q.runtime.crawlerEnabledBySettings || q.runtime.disabledByEnv ? (
                  <p>
                    <span className="font-medium">Autonomous crawler is off.</span>{" "}
                    {q.runtime.disabledByEnv
                      ? "DISABLE_PROSPECT_CRAWLER is set on this server."
                      : "Start the crawler below, or enable the legacy toggle in fine-tuning."}
                  </p>
                ) : null}
                {!q.runtime.serpSourcesEnabled ? (
                  <p>
                    <span className="font-medium">LinkedIn/SERP sources are locked off</span> until{" "}
                    <span className="font-mono">PROSPECT_ENABLE_SERP_SOURCES=true</span>.
                  </p>
                ) : null}
                {q.queue.deadCount > 0 ? (
                  <p>
                    <span className="font-medium">{q.queue.deadCount} dead queue job(s).</span>{" "}
                    {q.queue.lastDeadErrorMessage ? `Last error: ${q.queue.lastDeadErrorMessage}` : "See diagnostics below."}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busyCtl}
                onClick={() => startCrawler.mutate()}
              >
                <Play className="h-3.5 w-3.5" />
                Start crawler
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                disabled={busyCtl}
                onClick={() => stopCrawler.mutate()}
              >
                <Square className="h-3.5 w-3.5" />
                Stop crawler
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={busyCtl}
                onClick={() => pauseQueue.mutate()}
              >
                <Pause className="h-3.5 w-3.5" />
                Pause queue
              </Button>
              <Button size="sm" variant="outline" disabled={busyCtl} onClick={() => resumeQueue.mutate()}>
                Resume queue
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={busyCtl || q.runtime.disabledByEnv}
                onClick={() => runFull.mutate()}
              >
                Run full safe cycle now
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busyCtl || q.runtime.disabledByEnv} className="gap-1">
                    Manual tick
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem disabled={runSeed.isPending} onClick={() => runSeed.mutate()}>
                    Run seed tick now
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={runCompany.isPending} onClick={() => runCompany.mutate()}>
                    Run company queue tick now
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={runEmployee.isPending} onClick={() => runEmployee.mutate()}>
                    Run employee queue tick now
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {q.runtime.disabledByEnv ? (
              <p className="text-xs text-muted-foreground">Manual and scheduled ticks are disabled by DISABLE_PROSPECT_CRAWLER.</p>
            ) : !q.runtime.crawlerEnabledBySettings ? (
              <p className="text-xs text-muted-foreground">
                Manual runs are allowed while the crawler is stopped; they ignore the scheduler but still respect daily HTTP
                budgets, max per tick, and source safety (no SERP unless enabled by env).
              </p>
            ) : null}

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Scheduler</CardTitle>
                <CardDescription className="text-xs">
                  Intervals clamp to {SCHED_MIN_SEED}–{SCHED_MAX_MINUTES} minutes
                  (seed min {SCHED_MIN_SEED}, company min {SCHED_MIN_COMPANY},
                  employee min {SCHED_MIN_EMPLOYEE}). Env caps also apply to HTTP budget and per-tick
                  limits.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="sched-on" className="text-sm">
                      Scheduler enabled
                    </Label>
                    <p className="text-xs text-muted-foreground">When off, automatic ticks do not run (manual still available).</p>
                  </div>
                  <Switch id="sched-on" checked={schedOn} onCheckedChange={v => setSchedOn(v === true)} disabled={settingsQ.isLoading} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Seed tick (minutes)</Label>
                    <Input
                      type="number"
                      min={SCHED_MIN_SEED}
                      max={SCHED_MAX_MINUTES}
                      value={seedM}
                      onChange={e => setSeedM(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Company queue (minutes)</Label>
                    <Input
                      type="number"
                      min={SCHED_MIN_COMPANY}
                      max={SCHED_MAX_MINUTES}
                      value={coM}
                      onChange={e => setCoM(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Employee queue (minutes)</Label>
                    <Input
                      type="number"
                      min={SCHED_MIN_EMPLOYEE}
                      max={SCHED_MAX_MINUTES}
                      value={emM}
                      onChange={e => setEmM(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Last ticks: seed {fmtDt(q.scheduler.lastSeedTickAt)} · company {fmtDt(q.scheduler.lastCompanyQueueTickAt)} · employee {fmtDt(q.scheduler.lastEmployeeQueueTickAt)}</p>
                  <p>
                    Queue paused (DB): {q.scheduler.queuePaused ? "yes" : "no"} · Crawler enabled:{" "}
                    {q.runtime.crawlerEnabledBySettings ? "yes" : "no"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={updateSchedule.isPending || settingsQ.isLoading}
                  onClick={() =>
                    updateSchedule.mutate({
                      schedulerEnabled: schedOn,
                      seedTickIntervalMinutes: seedM,
                      companyQueueTickIntervalMinutes: coM,
                      employeeQueueTickIntervalMinutes: emM,
                    })
                  }
                >
                  {updateSchedule.isPending ? "Saving…" : "Save schedule"}
                </Button>
              </CardContent>
            </Card>

            <Accordion type="multiple" className="border border-border/60 rounded-md px-2">
              <AccordionItem value="fine" className="border-0">
                <AccordionTrigger className="text-sm py-2">Fine tuning &amp; crawler identity</AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  {settingsCard}
                  <div className="rounded-md border border-dashed border-border/80 p-3 text-xs space-y-2 bg-muted/10">
                    <p className="font-medium text-foreground">Read-only infrastructure</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>
                        Public URL: <span className="text-foreground break-all">{q.runtime.crawlerPublicUrl}</span>
                      </li>
                      <li>
                        User-Agent: <span className="text-foreground break-all">{q.runtime.crawlerUserAgent}</span>
                      </li>
                      <li>Outbound IPv4 configured: {q.runtime.outboundIpConfigured ? "yes" : "no"}</li>
                      <li>
                        SERP / LinkedIn HTML sources: {serpLocked ? "locked off (env)" : "enabled by env"}
                      </li>
                      <li>
                        Effective caps — HTTP/day {q.effectiveSettings.caps.maxHttpBudget}, max/tick {q.effectiveSettings.caps.maxPerTick}, fetch bytes {q.effectiveSettings.caps.maxFetchBytes}
                      </li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="diag" className="border-0">
                <AccordionTrigger className="text-sm py-2">Diagnostics &amp; queue detail</AccordionTrigger>
                <AccordionContent className="space-y-4 pb-2">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Runtime</p>
                      <ul className="space-y-0.5 text-xs">
                        <li>Crawler enabled: {q.runtime.crawlerEnabledBySettings ? "yes" : "no"}</li>
                        <li>Scheduler enabled: {q.scheduler.schedulerEnabled ? "yes" : "no"}</li>
                        <li>DISABLE_PROSPECT_CRAWLER: {q.runtime.disabledByEnv ? "yes" : "no"}</li>
                        <li>Database: {q.runtime.databaseConfigured ? "yes" : "no"}</li>
                        <li>Data mode: {q.effectiveSettings.dataMode}</li>
                      </ul>
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Effective tuning</p>
                      <ul className="text-xs space-y-0.5">
                        <li>HTTP budget/day: {q.effectiveSettings.dailyHttpBudget}</li>
                        <li>Max per tick: {q.effectiveSettings.maxPerTick}</li>
                        <li>Fetch timeout: {q.effectiveSettings.fetchTimeoutMs} ms</li>
                        <li>Fetch max bytes: {q.effectiveSettings.fetchMaxBytes}</li>
                        <li>Robots.txt: {q.effectiveSettings.respectRobotsTxt ? "yes" : "no"}</li>
                        <li>AI extraction: {q.effectiveSettings.aiExtractionEnabled ? "yes" : "no"}</li>
                      </ul>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seeds health</p>
                      <p className="text-sm">
                        Total {q.seeds.total.toLocaleString()} · enabled {q.seeds.enabled.toLocaleString()} · due now{" "}
                        {q.seeds.dueNow.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Next due (enabled): {q.seeds.nextDueAt ? new Date(q.seeds.nextDueAt).toLocaleString() : "—"}
                      </p>
                    </div>
                  </div>

                  {q.recentErrors.length > 0 ? (
                    <div className="text-sm space-y-1">
                      <p className="text-xs font-medium text-destructive uppercase tracking-wide">Recent errors</p>
                      <ul className="list-disc pl-4 space-y-1 text-xs">
                        {q.recentErrors.map((er, i) => (
                          <li key={`${er.source}-${i}`}>
                            <span className="font-mono">{er.source}</span>: {er.message}{" "}
                            <span className="text-muted-foreground">({fmtDt(er.at)})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {lastRun ? (
                    <div className="text-sm">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Last crawl run row</p>
                      <p>
                        <span className="font-mono text-xs">{lastRun.kind}</span> · {lastRun.status} · found {lastRun.itemsFound}, new{" "}
                        {lastRun.itemsNew} · started {fmtDt(lastRun.startedAt)}
                        {lastRun.finishedAt ? ` · finished ${fmtDt(lastRun.finishedAt)}` : ""}
                      </p>
                    </div>
                  ) : null}

                  {errorRuns.length > 0 ? (
                    <div className="text-sm space-y-1">
                      <p className="text-xs font-medium text-destructive uppercase tracking-wide">Recent error runs</p>
                      <ul className="list-disc pl-4 space-y-1 text-xs">
                        {errorRuns.map(r => (
                          <li key={r.id}>
                            <span className="font-mono">{r.kind}</span>: {r.errorMessage || r.status}{" "}
                            <span className="text-muted-foreground">({fmtDt(r.startedAt)})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {q.queue.inFlightJobs.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">In-flight queue jobs</p>
                      <div className="overflow-x-auto rounded-md border border-border/60">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">ID</TableHead>
                              <TableHead>Kind</TableHead>
                              <TableHead>Locked by</TableHead>
                              <TableHead>Locked at</TableHead>
                              <TableHead className="w-20">Attempts</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {q.queue.inFlightJobs.map(j => (
                              <TableRow key={j.id}>
                                <TableCell className="font-mono text-xs">{j.id}</TableCell>
                                <TableCell className="font-mono text-xs">{j.kind}</TableCell>
                                <TableCell className="text-xs break-all">{j.lockedBy ?? "—"}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap">{fmtDt(j.lockedAt)}</TableCell>
                                <TableCell className="text-xs">{j.attempts}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}

                  <Accordion type="single" collapsible className="border border-border/60 rounded-md px-2">
                    <AccordionItem value="kind-status" className="border-0">
                      <AccordionTrigger className="text-sm py-2">Queue by kind × status</AccordionTrigger>
                      <AccordionContent>
                        <div className="overflow-x-auto pb-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Kind</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Count</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {q.queue.byKindStatus.map((r, i) => (
                                <TableRow key={`${r.kind}-${r.status}-${i}`}>
                                  <TableCell className="font-mono text-xs">{r.kind}</TableCell>
                                  <TableCell className="text-xs">{r.status}</TableCell>
                                  <TableCell className="text-right text-xs">{r.count.toLocaleString()}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="seeds" className="border-0">
                      <AccordionTrigger className="text-sm py-2">Seed rows (up to {q.seeds.rows.length})</AccordionTrigger>
                      <AccordionContent>
                        <div className="overflow-x-auto max-h-72 overflow-y-auto pb-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">ID</TableHead>
                                <TableHead>Kind</TableHead>
                                <TableHead>Region</TableHead>
                                <TableHead>On</TableHead>
                                <TableHead>Errors</TableHead>
                                <TableHead>Last run</TableHead>
                                <TableHead>Next run</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {q.seeds.rows.map(s => (
                                <TableRow key={s.id}>
                                  <TableCell className="font-mono text-xs">{s.id}</TableCell>
                                  <TableCell className="font-mono text-xs">{s.kind}</TableCell>
                                  <TableCell className="text-xs">{s.region}</TableCell>
                                  <TableCell className="text-xs">{s.enabled ? "yes" : "no"}</TableCell>
                                  <TableCell className="text-xs">{s.consecutiveErrors}</TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">{fmtDt(s.lastRunAt)}</TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">{fmtDt(s.nextRunAt)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  );
}
