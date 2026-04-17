import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { getDecisionMakerAutocompleteTitles } from "@shared/decisionMakerTitles";

type CandidateRow = {
  id: string;
  company: string;
  domain: string | null;
  fullName: string | null;
  matchedTitle: string | null;
  evidenceUrl: string | null;
  guessedEmails: Array<{ email: string; confidence: number; reason: string }>;
};

export default function Prospecting() {
  const utils = trpc.useUtils();
  const [industry, setIndustry] = useState("iGaming");
  const [title, setTitle] = useState("CEO");
  const [country, setCountry] = useState("");
  const [companiesText, setCompaniesText] = useState("");
  const [maxCompanies, setMaxCompanies] = useState(8);

  const [runId, setRunId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const titleSuggestions = useMemo(() => getDecisionMakerAutocompleteTitles(), []);

  const companies = useMemo(
    () =>
      companiesText
        .split(/\r?\n/g)
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 50),
    [companiesText],
  );

  const runMutation = trpc.prospecting.runV1.useMutation({
    onSuccess: data => {
      setRunId(data.runId);
      setSelected({});
      toast.success("Prospecting started");
    },
    onError: e => toast.error(e.message),
  });

  const statusQuery = trpc.prospecting.statusV1.useQuery(
    { runId: runId ?? "00000000-0000-0000-0000-000000000000" },
    {
      enabled: Boolean(runId),
      refetchInterval: query =>
        query.state.data?.state === "running" ? 1500 : false,
    },
  );

  const importMutation = trpc.prospecting.importSelectedV1.useMutation({
    onSuccess: res => {
      toast.success(`Imported ${res.imported} contact(s)`);
      void utils.contacts.list.invalidate();
      setSelected({});
    },
    onError: e => toast.error(e.message),
  });

  const rows: CandidateRow[] =
    (statusQuery.data && "result" in statusQuery.data ? statusQuery.data.result?.items : []) ?? [];
  const doneStats =
    statusQuery.data?.state === "done" ? statusQuery.data.result.stats : null;

  useEffect(() => {
    if (!statusQuery.data) return;
    if (statusQuery.data.state === "error") toast.error(statusQuery.data.error);
  }, [statusQuery.data]);

  const allSelected = rows.length > 0 && rows.every(r => selected[r.id]);
  const selectedIds = rows.filter(r => selected[r.id]).map(r => r.id);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Prospecting (Basic)</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Cost-free: uses Signals → company websites (team/leadership pages) → email guessing.
            </p>
          </div>
          <Button
            onClick={() =>
              runMutation.mutate({
                industry,
                title,
                country: country.trim() || undefined,
                companies,
                maxCompanies,
              })
            }
            disabled={runMutation.isPending || statusQuery.data?.state === "running"}
          >
            {runMutation.isPending || statusQuery.data?.state === "running" ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Run
          </Button>
        </div>

        <Card className="border-border/50 bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">Search</CardTitle>
            <CardDescription>Industry + title + optional country filter. Optionally provide company names.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input value={industry} onChange={e => setIndustry(e.target.value)} className="bg-muted/30 border-border/50" />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="bg-muted/30 border-border/50"
                list="prospecting-title-suggestions"
              />
              <datalist id="prospecting-title-suggestions">
                {titleSuggestions.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">Example: CEO, Founder, CTO, Managing Director</p>
            </div>
            <div className="space-y-2">
              <Label>Country (optional)</Label>
              <Input value={country} onChange={e => setCountry(e.target.value)} className="bg-muted/30 border-border/50" />
            </div>
            <div className="space-y-2">
              <Label>Max companies</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxCompanies}
                onChange={e => setMaxCompanies(Number(e.target.value))}
                className="bg-muted/30 border-border/50"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Companies (optional, one per line)</Label>
              <Textarea
                value={companiesText}
                onChange={e => setCompaniesText(e.target.value)}
                rows={4}
                className="bg-muted/30 border-border/50"
                placeholder={"Example:\nEvolution\nBetsson\nPlaytech"}
              />
              <p className="text-xs text-muted-foreground">
                If blank, we seed companies from your Signals feed (filtered by Industry/Country keywords).
              </p>
            </div>
          </CardContent>
        </Card>

        {runId && statusQuery.data && (
          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Run status</CardTitle>
              <CardDescription>
                {statusQuery.data.state === "running"
                  ? `Running: ${statusQuery.data.step} (${statusQuery.data.progress.companiesDone}/${statusQuery.data.progress.companiesTotal})`
                  : statusQuery.data.state === "done"
                    ? `Done: ${statusQuery.data.result.stats.candidatesFound} candidates`
                    : "Error"}
              </CardDescription>
              {doneStats && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div>
                    Companies processed: {doneStats.companiesProcessed} | Seeded from Signals:{" "}
                    {doneStats.companiesSeeded}
                  </div>
                  <div>
                    Domains found: {doneStats.companiesWithDomain} | No-domain fallback used:{" "}
                    {doneStats.fallbackSearchCompanies}
                  </div>
                  <div>
                    Pages fetched: {doneStats.pagesFetched}/{doneStats.pagesAttempted}
                  </div>
                  {doneStats.zeroResultReason && (
                    <div className="text-amber-500">
                      No results reason: {doneStats.zeroResultReason}
                    </div>
                  )}
                </div>
              )}
            </CardHeader>
          </Card>
        )}

        <Card className="border-border/50 bg-card/80">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Shortlist</CardTitle>
              <CardDescription>Select matches and import to Contacts.</CardDescription>
            </div>
            <Button
              variant="outline"
              disabled={!runId || selectedIds.length === 0 || importMutation.isPending}
              onClick={() => runId && importMutation.mutate({ runId, candidateIds: selectedIds })}
            >
              Import selected ({selectedIds.length})
            </Button>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">No results yet.</div>
                {doneStats?.zeroResultReason && (
                  <div className="text-xs text-amber-500">{doneStats.zeroResultReason}</div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="p-3 w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={v => {
                            const checked = Boolean(v);
                            const next: Record<string, boolean> = {};
                            for (const r of rows) next[r.id] = checked;
                            setSelected(next);
                          }}
                        />
                      </th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Person
                      </th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Company
                      </th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Evidence
                      </th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Email guesses
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 align-top">
                          <Checkbox
                            checked={Boolean(selected[r.id])}
                            onCheckedChange={v => setSelected(s => ({ ...s, [r.id]: Boolean(v) }))}
                          />
                        </td>
                        <td className="p-3 align-top">
                          <div className="space-y-1">
                            <div className="text-sm font-medium">{r.fullName ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.matchedTitle ?? "—"}</div>
                          </div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="space-y-1">
                            <div className="text-sm">{r.company}</div>
                            {r.domain ? (
                              <Badge variant="secondary" className="text-xs">
                                {r.domain}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">domain unknown</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 align-top">
                          {r.evidenceUrl ? (
                            <a
                              href={r.evidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              Page <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 align-top">
                          {r.guessedEmails.length === 0 ? (
                            <span className="text-sm text-muted-foreground">—</span>
                          ) : (
                            <div className="space-y-1">
                              {r.guessedEmails.slice(0, 3).map(g => (
                                <div key={g.email} className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-mono">{g.email}</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {Math.round(g.confidence * 100)}%
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

