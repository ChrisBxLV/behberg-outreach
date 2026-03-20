import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, Plus, Play, Pause, BarChart3, Users, Send, Eye, MessageSquare, Trash2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  draft: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  paused: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  completed: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

export default function Campaigns() {
  const [, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", fromName: "Behberg", fromEmail: "", replyTo: "" });
  const utils = trpc.useUtils();

  const { data: campaigns, isLoading } = trpc.campaigns.list.useQuery();

  const createMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success("Campaign created");
      setShowCreate(false);
      setForm({ name: "", description: "", fromName: "Behberg", fromEmail: "", replyTo: "" });
      utils.campaigns.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.campaigns.delete.useMutation({
    onSuccess: () => { toast.success("Campaign deleted"); utils.campaigns.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const pauseMutation = trpc.campaigns.pause.useMutation({
    onSuccess: () => { toast.success("Campaign paused"); utils.campaigns.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const resumeMutation = trpc.campaigns.resume.useMutation({
    onSuccess: () => { toast.success("Campaign resumed"); utils.campaigns.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Campaigns</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{campaigns?.length ?? 0} total campaigns</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />New Campaign
          </Button>
        </div>

        {/* Campaign Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-border/50 bg-card/80 animate-pulse">
                <CardContent className="p-6 space-y-3">
                  <div className="h-5 bg-muted/40 rounded w-3/4" />
                  <div className="h-4 bg-muted/40 rounded w-1/2" />
                  <div className="h-8 bg-muted/40 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : campaigns?.length === 0 ? (
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-16 text-center">
              <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
              <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
              <p className="text-muted-foreground text-sm mb-6">Create your first email campaign to start reaching out to prospects.</p>
              <Button onClick={() => setShowCreate(true)} className="bg-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />Create Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {campaigns?.map(campaign => {
              const openRate = (campaign.sentCount ?? 0) > 0
                ? Math.round(((campaign.openCount ?? 0) / (campaign.sentCount ?? 1)) * 100)
                : 0;
              const replyRate = (campaign.sentCount ?? 0) > 0
                ? Math.round(((campaign.replyCount ?? 0) / (campaign.sentCount ?? 1)) * 100)
                : 0;

              return (
                <Card key={campaign.id} className="border-border/50 bg-card/80 hover:border-primary/30 transition-colors group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base font-semibold truncate">{campaign.name}</CardTitle>
                        {campaign.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{campaign.description}</p>
                        )}
                      </div>
                      <Badge className={`text-xs border shrink-0 ${STATUS_COLORS[campaign.status] ?? ""}`}>
                        {campaign.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <Send className="h-3 w-3" />
                        </div>
                        <p className="text-lg font-bold">{campaign.sentCount ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Sent</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <Eye className="h-3 w-3" />
                        </div>
                        <p className="text-lg font-bold">{openRate}%</p>
                        <p className="text-xs text-muted-foreground">Opens</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <MessageSquare className="h-3 w-3" />
                        </div>
                        <p className="text-lg font-bold">{replyRate}%</p>
                        <p className="text-xs text-muted-foreground">Replies</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => setLocation(`/app/campaigns/${campaign.id}`)}
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />Open
                      </Button>
                      {campaign.status === "active" ? (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => pauseMutation.mutate({ campaignId: campaign.id })}>
                          <Pause className="h-3 w-3" />
                        </Button>
                      ) : campaign.status === "paused" ? (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => resumeMutation.mutate({ campaignId: campaign.id })}>
                          <Play className="h-3 w-3" />
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive text-xs"
                        onClick={() => {
                          if (confirm(`Delete campaign "${campaign.name}"?`)) {
                            deleteMutation.mutate({ id: campaign.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create Campaign Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle>New Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-xs">Campaign Name *</Label>
                <Input className="mt-1 bg-muted/30 border-border/50" placeholder="e.g. Q1 Tech Outreach" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea className="mt-1 bg-muted/30 border-border/50 text-sm" rows={2} placeholder="Optional description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">From Name</Label>
                  <Input className="mt-1 bg-muted/30 border-border/50 h-8 text-sm" value={form.fromName} onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">From Email</Label>
                  <Input className="mt-1 bg-muted/30 border-border/50 h-8 text-sm" placeholder="outreach@behberg.com" value={form.fromEmail} onChange={e => setForm(f => ({ ...f, fromEmail: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Reply-To Email</Label>
                <Input className="mt-1 bg-muted/30 border-border/50 h-8 text-sm" placeholder="Optional reply-to address" value={form.replyTo} onChange={e => setForm(f => ({ ...f, replyTo: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate(form as any)} disabled={!form.name || createMutation.isPending}>
                Create Campaign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
