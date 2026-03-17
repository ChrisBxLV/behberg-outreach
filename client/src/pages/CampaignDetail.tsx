import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, Save, Play, Pause, Users, Send, Eye,
  MessageSquare, Sparkles, Mail, Clock, GitBranch, RefreshCw, CheckCircle2
} from "lucide-react";
import { useLocation, useParams } from "wouter";

type SequenceStep = {
  id?: number;
  stepOrder: number;
  stepType: "initial" | "follow_up" | "last_notice" | "opened_no_reply";
  subject: string;
  bodyTemplate: string;
  delayDays: number;
  delayHours: number;
  condition: "always" | "not_opened" | "opened_no_reply" | "not_replied";
  useLlmPersonalization: boolean;
};

const STEP_TYPE_LABELS: Record<string, string> = {
  initial: "Initial Email",
  follow_up: "Follow-up",
  last_notice: "Last Notice",
  opened_no_reply: "Opened, No Reply",
};

const CONDITION_LABELS: Record<string, string> = {
  always: "Always send",
  not_opened: "If not opened",
  opened_no_reply: "If opened but no reply",
  not_replied: "If no reply",
};

const STEP_COLORS: Record<string, string> = {
  initial: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  follow_up: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  last_notice: "bg-red-500/20 text-red-300 border-red-500/30",
  opened_no_reply: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

const EMAIL_LOG_STATUS_COLORS: Record<string, string> = {
  sent: "bg-blue-500/20 text-blue-300",
  opened: "bg-emerald-500/20 text-emerald-300",
  replied: "bg-purple-500/20 text-purple-300",
  bounced: "bg-red-500/20 text-red-300",
  failed: "bg-red-500/20 text-red-300",
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const campaignId = parseInt(id ?? "0");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: campaign, isLoading } = trpc.campaigns.get.useQuery({ id: campaignId });
  const { data: campaignContacts } = trpc.campaigns.contacts.useQuery({ campaignId });
  const { data: emailLogs } = trpc.campaigns.emailLogs.useQuery({ campaignId });
  const { data: allContacts } = trpc.contacts.list.useQuery({ limit: 200 });

  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);

  useEffect(() => {
    if (campaign?.steps) {
      setSteps(campaign.steps.map(s => ({
        id: s.id,
        stepOrder: s.stepOrder,
        stepType: s.stepType as SequenceStep["stepType"],
        subject: s.subject,
        bodyTemplate: s.bodyTemplate,
        delayDays: s.delayDays ?? 0,
        delayHours: s.delayHours ?? 0,
        condition: (s.condition ?? "always") as SequenceStep["condition"],
        useLlmPersonalization: s.useLlmPersonalization ?? false,
      })));
    }
  }, [campaign?.steps]);

  const saveStepsMutation = trpc.campaigns.saveSteps.useMutation({
    onSuccess: () => { toast.success("Sequence saved"); utils.campaigns.get.invalidate({ id: campaignId }); },
    onError: (e) => toast.error(e.message),
  });

  const enrollMutation = trpc.campaigns.enroll.useMutation({
    onSuccess: (r) => {
      toast.success(`Enrolled ${r.enrolled} contacts`);
      setShowEnrollDialog(false);
      setSelectedContactIds([]);
      utils.campaigns.contacts.invalidate({ campaignId });
    },
    onError: (e) => toast.error(e.message),
  });

  const launchMutation = trpc.campaigns.launch.useMutation({
    onSuccess: (r) => {
      toast.success(`Campaign launched for ${r.contactCount} contacts`);
      setShowLaunchDialog(false);
      utils.campaigns.get.invalidate({ id: campaignId });
    },
    onError: (e) => toast.error(e.message),
  });

  const pauseMutation = trpc.campaigns.pause.useMutation({
    onSuccess: () => { toast.success("Campaign paused"); utils.campaigns.get.invalidate({ id: campaignId }); },
    onError: (e) => toast.error(e.message),
  });

  const resumeMutation = trpc.campaigns.resume.useMutation({
    onSuccess: () => { toast.success("Campaign resumed"); utils.campaigns.get.invalidate({ id: campaignId }); },
    onError: (e) => toast.error(e.message),
  });

  const markRepliedMutation = trpc.campaigns.markReplied.useMutation({
    onSuccess: () => { toast.success("Marked as replied"); utils.campaigns.emailLogs.invalidate({ campaignId }); },
    onError: (e) => toast.error(e.message),
  });

  const generateVariationsMutation = trpc.email.generateVariations.useMutation({
    onSuccess: (data, vars) => {
      const stepIdx = generatingFor;
      if (stepIdx === null) return;
      const variation = data.variations[0];
      if (variation) {
        setSteps(prev => prev.map((s, i) => i === stepIdx
          ? { ...s, subject: variation.subject, bodyTemplate: variation.body }
          : s
        ));
        toast.success("AI-generated email applied");
      }
      setGeneratingFor(null);
    },
    onError: (e) => { toast.error(e.message); setGeneratingFor(null); },
  });

  const addStep = () => {
    const isFirst = steps.length === 0;
    setSteps(prev => [...prev, {
      stepOrder: prev.length + 1,
      stepType: isFirst ? "initial" : "follow_up",
      subject: isFirst ? "Introduction from Behberg" : "Following up",
      bodyTemplate: isFirst
        ? "Hi {{firstName}},\n\nI came across your profile and wanted to reach out...\n\nBest regards,\n{{senderName}}"
        : "Hi {{firstName}},\n\nJust following up on my previous email...\n\nBest,\n{{senderName}}",
      delayDays: isFirst ? 0 : 3,
      delayHours: 0,
      condition: isFirst ? "always" : "not_replied",
      useLlmPersonalization: false,
    }]);
  };

  const removeStep = (idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 })));
  };

  const updateStep = (idx: number, updates: Partial<SequenceStep>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const enrolledContactIds = new Set(campaignContacts?.map(cc => cc.contact.id) ?? []);
  const availableContacts = allContacts?.contacts.filter(c => !enrolledContactIds.has(c.id)) ?? [];

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 opacity-40" />
          Loading campaign...
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Campaign not found</p>
          <Button className="mt-4" onClick={() => setLocation("/campaigns")}>Back to Campaigns</Button>
        </div>
      </DashboardLayout>
    );
  }

  const openRate = (campaign.sentCount ?? 0) > 0 ? Math.round(((campaign.openCount ?? 0) / (campaign.sentCount ?? 1)) * 100) : 0;
  const replyRate = (campaign.sentCount ?? 0) > 0 ? Math.round(((campaign.replyCount ?? 0) / (campaign.sentCount ?? 1)) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/campaigns")} className="text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{campaign.name}</h1>
                <Badge className={`text-xs border ${
                  campaign.status === "active" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                  campaign.status === "paused" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                  campaign.status === "completed" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
                  "bg-slate-500/20 text-slate-300 border-slate-500/30"
                }`}>{campaign.status}</Badge>
              </div>
              {campaign.description && <p className="text-sm text-muted-foreground mt-0.5">{campaign.description}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            {campaign.status === "active" ? (
              <Button size="sm" variant="outline" onClick={() => pauseMutation.mutate({ campaignId })}>
                <Pause className="h-4 w-4 mr-2" />Pause
              </Button>
            ) : campaign.status === "paused" ? (
              <Button size="sm" variant="outline" onClick={() => resumeMutation.mutate({ campaignId })}>
                <Play className="h-4 w-4 mr-2" />Resume
              </Button>
            ) : null}
            {campaign.status === "draft" && (
              <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => setShowLaunchDialog(true)}>
                <Play className="h-4 w-4 mr-2" />Launch Campaign
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Enrolled", value: campaignContacts?.length ?? 0, icon: Users, color: "text-blue-400" },
            { label: "Sent", value: campaign.sentCount ?? 0, icon: Send, color: "text-primary" },
            { label: "Open Rate", value: `${openRate}%`, icon: Eye, color: "text-emerald-400" },
            { label: "Reply Rate", value: `${replyRate}%`, icon: MessageSquare, color: "text-purple-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="border-border/50 bg-card/80">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`h-5 w-5 ${color}`} />
                <div>
                  <p className="text-xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="sequence">
          <TabsList className="bg-muted/30 border border-border/50">
            <TabsTrigger value="sequence">Sequence Builder</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({campaignContacts?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="logs">Email Logs ({emailLogs?.length ?? 0})</TabsTrigger>
          </TabsList>

          {/* Sequence Builder */}
          <TabsContent value="sequence" className="mt-4 space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Build your email sequence. Use <code className="text-primary bg-primary/10 px-1 rounded text-xs">{"{{firstName}}"}</code>, <code className="text-primary bg-primary/10 px-1 rounded text-xs">{"{{company}}"}</code>, <code className="text-primary bg-primary/10 px-1 rounded text-xs">{"{{title}}"}</code> as placeholders.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addStep}>
                  <Plus className="h-4 w-4 mr-1" />Add Step
                </Button>
                <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => saveStepsMutation.mutate({ campaignId, steps })} disabled={saveStepsMutation.isPending}>
                  <Save className="h-4 w-4 mr-1" />Save Sequence
                </Button>
              </div>
            </div>

            {steps.length === 0 ? (
              <Card className="border-border/50 bg-card/80 border-dashed">
                <CardContent className="p-12 text-center">
                  <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground text-sm">No steps yet. Add your first email step.</p>
                  <Button size="sm" className="mt-4" onClick={addStep}><Plus className="h-4 w-4 mr-1" />Add First Step</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {steps.map((step, idx) => (
                  <Card key={idx} className="border-border/50 bg-card/80">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-7 w-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                          <Select value={step.stepType} onValueChange={v => updateStep(idx, { stepType: v as SequenceStep["stepType"] })}>
                            <SelectTrigger className="w-44 h-7 text-xs bg-muted/30 border-border/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STEP_TYPE_LABELS).map(([v, l]) => (
                                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Badge className={`text-xs border ${STEP_COLORS[step.stepType] ?? ""}`}>
                            {STEP_TYPE_LABELS[step.stepType]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-primary hover:text-primary h-7"
                            disabled={generatingFor === idx}
                            onClick={() => {
                              const firstContact = allContacts?.contacts[0];
                              if (!firstContact) { toast.error("Add contacts first to generate AI content"); return; }
                              setGeneratingFor(idx);
                              generateVariationsMutation.mutate({ contactId: firstContact.id, stepType: step.stepType, count: 1 });
                            }}
                          >
                            {generatingFor === idx ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                            AI Generate
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7" onClick={() => removeStep(idx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Delay & Condition */}
                      {idx > 0 && (
                        <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-muted/20 border border-border/30">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Send after:</span>
                            <Input type="number" min={0} className="w-16 h-7 text-xs bg-muted/30 border-border/50 text-center" value={step.delayDays} onChange={e => updateStep(idx, { delayDays: parseInt(e.target.value) || 0 })} />
                            <span className="text-xs text-muted-foreground">days</span>
                            <Input type="number" min={0} max={23} className="w-16 h-7 text-xs bg-muted/30 border-border/50 text-center" value={step.delayHours} onChange={e => updateStep(idx, { delayHours: parseInt(e.target.value) || 0 })} />
                            <span className="text-xs text-muted-foreground">hours</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Condition:</span>
                            <Select value={step.condition} onValueChange={v => updateStep(idx, { condition: v as SequenceStep["condition"] })}>
                              <SelectTrigger className="w-44 h-7 text-xs bg-muted/30 border-border/50">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(CONDITION_LABELS).map(([v, l]) => (
                                  <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {/* Subject */}
                      <div>
                        <Label className="text-xs text-muted-foreground">Subject Line</Label>
                        <Input className="mt-1 bg-muted/30 border-border/50 text-sm" value={step.subject} onChange={e => updateStep(idx, { subject: e.target.value })} placeholder="Email subject..." />
                      </div>

                      {/* Body */}
                      <div>
                        <Label className="text-xs text-muted-foreground">Email Body</Label>
                        <Textarea className="mt-1 bg-muted/30 border-border/50 text-sm font-mono" rows={6} value={step.bodyTemplate} onChange={e => updateStep(idx, { bodyTemplate: e.target.value })} placeholder="Email body..." />
                      </div>

                      {/* LLM Toggle */}
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <div className="flex-1">
                          <p className="text-xs font-medium">AI Personalization</p>
                          <p className="text-xs text-muted-foreground">Use LLM to personalize this email for each contact based on their role, company, and industry</p>
                        </div>
                        <Switch checked={step.useLlmPersonalization} onCheckedChange={v => updateStep(idx, { useLlmPersonalization: v })} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="mt-4">
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Enrolled Contacts</CardTitle>
                <Button size="sm" onClick={() => setShowEnrollDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />Enroll Contacts
                </Button>
              </CardHeader>
              <CardContent>
                {!campaignContacts?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No contacts enrolled yet</p>
                    <Button size="sm" className="mt-3" onClick={() => setShowEnrollDialog(true)}>Enroll Contacts</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {campaignContacts.map(item => (
                      <div key={item.cc.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                        <div>
                          <p className="text-sm font-medium">{item.contact.fullName ?? (`${item.contact.firstName ?? ""} ${item.contact.lastName ?? ""}`.trim() || "—")}</p>
                          <p className="text-xs text-muted-foreground">{item.contact.email} · {item.contact.company}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${
                            item.cc.status === "completed" ? "bg-emerald-500/20 text-emerald-300" :
                            item.cc.status === "active" ? "bg-blue-500/20 text-blue-300" :
                            item.cc.status === "replied" ? "bg-purple-500/20 text-purple-300" :
                            item.cc.status === "bounced" ? "bg-red-500/20 text-red-300" :
                            "bg-slate-500/20 text-slate-300"
                          }`}>{item.cc.status}</Badge>
                          {item.cc.nextSendAt && <span className="text-xs text-muted-foreground">Next: {new Date(item.cc.nextSendAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Logs Tab */}
          <TabsContent value="logs" className="mt-4">
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Email Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                {!emailLogs?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No emails sent yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-xs text-muted-foreground">
                          <th className="p-3 text-left">Contact</th>
                          <th className="p-3 text-left">Subject</th>
                          <th className="p-3 text-left">Status</th>
                          <th className="p-3 text-left">Sent At</th>
                          <th className="p-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emailLogs.map(item => (
                          <tr key={item.log.id} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="p-3">
                              <p className="font-medium">{item.contact?.fullName ?? item.contact?.email ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{item.contact?.company}</p>
                            </td>
                            <td className="p-3 max-w-48 truncate">{item.log.subject}</td>
                            <td className="p-3">
                              <Badge className={`text-xs ${EMAIL_LOG_STATUS_COLORS[item.log.repliedAt ? "replied" : item.log.status] ?? ""}`}>{item.log.repliedAt ? "replied" : item.log.status}</Badge>
                              {(item.log.openCount ?? 0) > 0 && <span className="text-xs text-muted-foreground ml-2">{item.log.openCount}x opened</span>}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {item.log.sentAt ? new Date(item.log.sentAt).toLocaleString() : "—"}
                            </td>
                            <td className="p-3">
                              {!item.log.repliedAt && (
                                <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => markRepliedMutation.mutate({ emailLogId: item.log.id })}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" />Mark Replied
                                </Button>
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
          </TabsContent>
        </Tabs>

        {/* Enroll Dialog */}
        <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
          <DialogContent className="bg-card border-border max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Enroll Contacts</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {availableContacts.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">All contacts are already enrolled or no contacts available.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                    <Checkbox
                      checked={selectedContactIds.length === availableContacts.length}
                      onCheckedChange={checked => setSelectedContactIds(checked ? availableContacts.map(c => c.id) : [])}
                    />
                    <span className="text-sm font-medium">Select all ({availableContacts.length})</span>
                  </div>
                  {availableContacts.map(contact => (
                    <div key={contact.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/30">
                      <Checkbox
                        checked={selectedContactIds.includes(contact.id)}
                        onCheckedChange={checked => setSelectedContactIds(prev => checked ? [...prev, contact.id] : prev.filter(id => id !== contact.id))}
                      />
                      <div>
                        <p className="text-sm font-medium">{contact.fullName ?? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()}</p>
                        <p className="text-xs text-muted-foreground">{contact.email} · {contact.company}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEnrollDialog(false)}>Cancel</Button>
              <Button disabled={!selectedContactIds.length || enrollMutation.isPending} onClick={() => enrollMutation.mutate({ campaignId, contactIds: selectedContactIds })}>
                Enroll {selectedContactIds.length > 0 ? selectedContactIds.length : ""} Contact{selectedContactIds.length !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Launch Dialog */}
        <Dialog open={showLaunchDialog} onOpenChange={setShowLaunchDialog}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle>Launch Campaign</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                This will activate the campaign and begin sending emails to all enrolled contacts according to your sequence schedule.
              </p>
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-xs text-amber-300">Make sure your sequence steps are saved and your SMTP is configured before launching.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLaunchDialog(false)}>Cancel</Button>
              <Button className="bg-primary text-primary-foreground" onClick={() => launchMutation.mutate({ campaignId })} disabled={launchMutation.isPending}>
                <Play className="h-4 w-4 mr-2" />Launch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
