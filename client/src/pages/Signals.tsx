import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Radar, RefreshCw, Sparkles, TimerReset, TrendingUp, UserRoundCheck } from "lucide-react";
import { useLocation } from "wouter";

type SignalFilters = {
  search?: string;
  tag?: string;
  signalType?: string;
};
type RefreshBreakdown = {
  total_articles: number;
  after_keyword_filter: number;
  classified_as_signal: number;
  passed_extraction: number;
  passed_validation: number;
  final_signals_saved: number;
};

function cleanSignalText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function companyWebsiteSearchUrl(companyName: string): string {
  return `https://www.google.com/search?btnI=1&q=${encodeURIComponent(`${companyName} official website`)}`;
}

function sourceHeadlineFromItem(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const maybeRawPayload = (item as { rawPayload?: unknown }).rawPayload;
  if (!maybeRawPayload || typeof maybeRawPayload !== "object") return null;
  const title = (maybeRawPayload as { title?: unknown }).title;
  if (typeof title !== "string" || title.trim().length === 0) return null;
  return cleanSignalText(title);
}

export default function Signals() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [showSignalsProModal, setShowSignalsProModal] = useState(false);
  const [signalsProEnabled, setSignalsProEnabled] = useState(false);
  const [profileForm, setProfileForm] = useState({
    selectedTags: [] as string[],
    selectedSignalTypes: [] as string[],
    refreshCadenceMinutes: 30,
    isEnabled: true,
  });

  const { data: taxonomy } = trpc.signals.taxonomy.useQuery();
  const { data: profile, isLoading: profileLoading } = trpc.signals.getProfile.useQuery();
  const { data: orgMine } = trpc.organization.mine.useQuery();
  const subscriptionPlanId = orgMine?.organization?.subscriptionPlanId ?? "free";
  const hasSignalsProAccess = ["business_standard", "pro", "enterprise"].includes(subscriptionPlanId);
  const { data: feed, isLoading: feedLoading } = trpc.signals.listSignals.useQuery(
    {
      limit: 40,
    },
    { enabled: true },
  );

  const saveProfileMutation = trpc.signals.saveProfile.useMutation({
    onSuccess: () => {
      toast.success("Signals settings saved");
      void utils.signals.getProfile.invalidate();
      void utils.signals.listSignals.invalidate();
      void utils.signals.listFacets.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const refreshMutation = trpc.signals.triggerRefresh.useMutation({
    onSuccess: result => {
      toast.success(
        `Refreshed: ${result.stageCounters.total_articles} -> ${result.stageCounters.after_keyword_filter} -> ${result.stageCounters.classified_as_signal} -> ${result.stageCounters.passed_extraction} -> ${result.stageCounters.passed_validation} -> ${result.stageCounters.final_signals_saved}`,
      );
      void utils.signals.listSignals.invalidate();
      void utils.signals.listFacets.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const resetFeedMutation = trpc.signals.resetFeed.useMutation({
    onSuccess: () => {
      toast.success("Signals feed reset. Complete setup to start again.");
      setProfileForm(v => ({
        ...v,
        selectedTags: [],
        selectedSignalTypes: [],
      }));
      void utils.signals.getProfile.invalidate();
      void utils.signals.listSignals.invalidate();
      void utils.signals.listFacets.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const selectedTags = useMemo(() => {
    if (profile?.selectedTags?.length) return profile.selectedTags;
    return profileForm.selectedTags;
  }, [profile?.selectedTags, profileForm.selectedTags]);

  const selectedSignalTypes = useMemo(() => {
    if (profile?.selectedSignalTypes?.length) return profile.selectedSignalTypes;
    return profileForm.selectedSignalTypes;
  }, [profile?.selectedSignalTypes, profileForm.selectedSignalTypes]);

  const configured = true;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Signals</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Actionable company signals tailored to your business type and industry tags.
            </p>
          </div>
          {configured && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => refreshMutation.mutate({})}
                disabled={refreshMutation.isPending || resetFeedMutation.isPending}
              >
                {refreshMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh now
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm("Reset Signals setup and clear all fetched signal items?")) {
                    resetFeedMutation.mutate({});
                  }
                }}
                disabled={refreshMutation.isPending || resetFeedMutation.isPending}
              >
                Reset feed
              </Button>
            </div>
          )}
        </div>

        {!configured ? (
          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Set up Signals</CardTitle>
              <CardDescription>
                Signals collection starts only after this setup is saved and enabled.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Refresh cadence</Label>
                  <Select
                    value={String(profileForm.refreshCadenceMinutes)}
                    onValueChange={refreshCadenceMinutes =>
                      setProfileForm(v => ({ ...v, refreshCadenceMinutes: Number(refreshCadenceMinutes) }))
                    }
                  >
                    <SelectTrigger className="bg-muted/30 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">Every 15 minutes</SelectItem>
                      <SelectItem value="30">Every 30 minutes</SelectItem>
                      <SelectItem value="60">Every 1 hour</SelectItem>
                      <SelectItem value="180">Every 3 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Industry tags</Label>
                </div>
                <div className="rounded-md border border-border/40 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(taxonomy?.industryTags ?? []).map(tag => {
                    const checked = profileForm.selectedTags.includes(tag);
                    return (
                      <label key={tag} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={value =>
                            setProfileForm(v => ({
                              ...v,
                              selectedTags: value
                                ? [...v.selectedTags, tag]
                                : v.selectedTags.filter(x => x !== tag),
                            }))
                          }
                        />
                        <span>{tag}</span>
                      </label>
                    );
                  })}
                </div>
                {profileForm.selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {profileForm.selectedTags.map(tag => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label>Signal types</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(taxonomy?.signalTypes ?? []).map(type => {
                    const checked = profileForm.selectedSignalTypes.includes(type);
                    return (
                      <label key={type} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={value =>
                            setProfileForm(v => ({
                              ...v,
                              selectedSignalTypes: value
                                ? [...v.selectedSignalTypes, type]
                                : v.selectedSignalTypes.filter(x => x !== type),
                            }))
                          }
                        />
                        <span className="capitalize">{type.replaceAll("_", " ")}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <Button
                onClick={() =>
                  saveProfileMutation.mutate({
                    businessType: "other",
                    selectedTags: profileForm.selectedTags,
                    selectedSignalTypes: profileForm.selectedSignalTypes,
                    refreshCadenceMinutes: profileForm.refreshCadenceMinutes,
                    isEnabled: profileForm.isEnabled,
                  })
                }
                disabled={
                  saveProfileMutation.isPending ||
                  profileForm.selectedTags.length === 0 ||
                  profileForm.selectedSignalTypes.length === 0
                }
              >
                Save and start Signals
              </Button>
              {(profileForm.selectedTags.length === 0 || profileForm.selectedSignalTypes.length === 0) && (
                <p className="text-xs text-muted-foreground">
                  Select at least one industry tag and one signal type to enable Signals.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      Signals PRO
                      <Badge variant="secondary" className="text-[10px]">Business Standard+</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Unlock LLM-powered event intelligence with instant outreach actions and decision-maker matching.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {signalsProEnabled && (
                      <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Enabled
                      </Badge>
                    )}
                    <Switch
                      checked={signalsProEnabled}
                      onCheckedChange={(nextChecked) => {
                        if (nextChecked) {
                          setShowSignalsProModal(true);
                          return;
                        }
                        setSignalsProEnabled(false);
                      }}
                      aria-label="Enable Signals Pro"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {(feedLoading || profileLoading) && (
                <Card className="border-border/50 bg-card/80">
                  <CardContent className="p-6 text-sm text-muted-foreground">Loading signals...</CardContent>
                </Card>
              )}
              {!feedLoading && (feed?.items?.length ?? 0) === 0 && (
                <Card className="border-border/50 bg-card/80">
                  <CardContent className="p-10 text-center">
                    <Radar className="mx-auto h-10 w-10 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No matching signals yet. Try broadening filters or refresh now.
                    </p>
                  </CardContent>
                </Card>
              )}
              {(feed?.items ?? []).map(item => (
                <Card key={item.id} className="border-border/50 bg-card/80">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{sourceHeadlineFromItem(item) ?? item.summaryShort}</CardTitle>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(item.occurredAt).toLocaleDateString()}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {item.website_url ? (
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={item.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Company
                          </a>
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View Source
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
      <Dialog open={showSignalsProModal} onOpenChange={setShowSignalsProModal}>
        <DialogContent className="border-border bg-card sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-primary" />
              Turn Breaking News Into Pipeline with Signals PRO
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Signals PRO connects your AI assistant to live news and extracts high-intent moments your team can act on instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
              <p className="text-xs uppercase tracking-wide text-primary/90">Competitive Advantage</p>
              <p className="mt-1 font-semibold text-primary">
                Out-time your competition: contact buyers while the story is still breaking, not after everyone else has already reached out.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-primary">
                  <TimerReset className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Speed</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  LLM monitors news and extracts hot events in real time.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-primary">
                  <UserRoundCheck className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Precision</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Decision-maker matching ties every event to the best contact.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-primary">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Pipeline</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Launch outreach instantly with event-aware messaging that converts.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="font-medium">What your team can do in one click:</p>
              <ul className="mt-2 space-y-2 text-muted-foreground">
                <li>- Add the matched contact directly to a sequence with a relevant pitch angle.</li>
                <li>- Message the contact immediately while timing and intent are strongest.</li>
                <li>- Keep a daily flow of fresh opportunities before competitors react.</li>
              </ul>
            </div>
            {!hasSignalsProAccess ? (
              <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-primary">
                Your current plan is <span className="font-semibold">{subscriptionPlanId.replaceAll("_", " ")}</span>. Upgrade to <span className="font-semibold">Business Standard</span> to unlock Signals PRO.
              </p>
            ) : (
              <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-300">
                Your plan includes Signals PRO. Continue to enable premium signal intelligence now.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSignalsProModal(false)}>
              Not now
            </Button>
            {hasSignalsProAccess ? (
              <Button
                className="bg-primary text-primary-foreground"
                onClick={() => {
                  setSignalsProEnabled(true);
                  setShowSignalsProModal(false);
                  toast.success("Signals PRO enabled.");
                }}
              >
                Continue with Signals Pro
              </Button>
            ) : (
              <Button
                className="bg-primary text-primary-foreground"
                onClick={() => {
                  setShowSignalsProModal(false);
                  setLocation("/app/settings");
                  toast.message("Upgrade to Business Standard to enable Signals PRO.");
                }}
              >
                Upgrade to Business Standard
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
