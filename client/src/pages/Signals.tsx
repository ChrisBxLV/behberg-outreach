import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Radar, RefreshCw } from "lucide-react";

type SignalFilters = {
  search?: string;
  tag?: string;
  signalType?: string;
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

export default function Signals() {
  const utils = trpc.useUtils();
  const [filters, setFilters] = useState<SignalFilters>({});
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    businessType: "marketing_agency",
    selectedTags: [] as string[],
    selectedSignalTypes: [] as string[],
    refreshCadenceMinutes: 30,
    isEnabled: true,
  });

  const { data: taxonomy } = trpc.signals.taxonomy.useQuery();
  const { data: profile, isLoading: profileLoading } = trpc.signals.getProfile.useQuery();
  const { data: facets } = trpc.signals.listFacets.useQuery(undefined, {
    enabled: Boolean(profile?.isEnabled),
  });
  const { data: feed, isLoading: feedLoading } = trpc.signals.listSignals.useQuery(
    {
      limit: 40,
      search: filters.search,
      tag: filters.tag,
      signalType: filters.signalType,
    },
    { enabled: Boolean(profile?.isEnabled) },
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
        `Signals refreshed. Pulled ${result.fetchedCount} source items, added ${result.insertedCount} new signals.`,
      );
      void utils.signals.listSignals.invalidate();
      void utils.signals.listFacets.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const resetFeedMutation = trpc.signals.resetFeed.useMutation({
    onSuccess: () => {
      toast.success("Signals feed reset. Complete setup to start again.");
      setFilters({});
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

  const configured = Boolean(profile?.isEnabled);

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
                  <Label>Business type</Label>
                  <Select
                    value={profileForm.businessType}
                    onValueChange={businessType =>
                      setProfileForm(v => ({ ...v, businessType }))
                    }
                  >
                    <SelectTrigger className="bg-muted/30 border-border/50">
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(taxonomy?.businessTypes ?? []).map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsTagPickerOpen(v => !v)}
                  >
                    {isTagPickerOpen ? "Hide tags" : "Pick tags"}
                  </Button>
                </div>
                {isTagPickerOpen && (
                  <div className="max-h-56 overflow-auto rounded-md border border-border/40 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                )}
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
                    businessType: profileForm.businessType,
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
              <CardHeader>
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Input
                    placeholder="Search company or event..."
                    value={filters.search ?? ""}
                    onChange={e => setFilters(v => ({ ...v, search: e.target.value }))}
                  />
                  <Select
                    value={filters.tag ?? "__all__"}
                    onValueChange={tag =>
                      setFilters(v => ({ ...v, tag: tag === "__all__" ? undefined : tag }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All tags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All tags</SelectItem>
                      {(facets?.tags ?? selectedTags).map(tag => (
                        <SelectItem key={tag} value={tag}>
                          {tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.signalType ?? "__all__"}
                    onValueChange={signalType =>
                      setFilters(v => ({ ...v, signalType: signalType === "__all__" ? undefined : signalType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All signal types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All signal types</SelectItem>
                      {(facets?.signalTypes ?? selectedSignalTypes).map(type => (
                        <SelectItem key={type} value={type}>
                          {type.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                        <CardTitle className="text-base">{item.summaryShort}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {cleanSignalText(item.summaryDetail)}
                        </CardDescription>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(item.occurredAt).toLocaleDateString()}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{item.signalType.replaceAll("_", " ")}</Badge>
                      {(item.tags ?? []).slice(0, 4).map(tag => (
                        <Badge key={`${item.id}-${tag}`} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Separator />
                    <p className="text-sm">{item.actionSuggestion}</p>
                    <div>
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={item.companyWebsite || companyWebsiteSearchUrl(item.companyName)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Pitch to them?
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
    </DashboardLayout>
  );
}
