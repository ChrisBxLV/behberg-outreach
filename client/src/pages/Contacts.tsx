import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Upload, Search, Filter, Trash2, Users, CheckSquare,
  ChevronLeft, ChevronRight, ExternalLink, Mail, Building2,
  MapPin, Tag, Plus, RefreshCw, Download
} from "lucide-react";

const STAGE_OPTIONS = [
  { value: "all", label: "All Stages" },
  { value: "new", label: "New" },
  { value: "enriched", label: "Enriched" },
  { value: "in_sequence", label: "In Sequence" },
  { value: "replied", label: "Replied" },
  { value: "closed", label: "Closed" },
  { value: "unsubscribed", label: "Unsubscribed" },
];

const EMAIL_STATUS_OPTIONS = [
  { value: "all", label: "All Email Status" },
  { value: "valid", label: "Valid" },
  { value: "risky", label: "Risky" },
  { value: "invalid", label: "Invalid" },
  { value: "catch_all", label: "Catch-all" },
  { value: "unknown", label: "Unknown" },
];

const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  enriched: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  in_sequence: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  replied: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  closed: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  unsubscribed: "bg-red-500/20 text-red-300 border-red-500/30",
};

const EMAIL_STATUS_COLORS: Record<string, string> = {
  valid: "bg-emerald-500/20 text-emerald-300",
  invalid: "bg-red-500/20 text-red-300",
  risky: "bg-amber-500/20 text-amber-300",
  catch_all: "bg-blue-500/20 text-blue-300",
  unknown: "bg-slate-500/20 text-slate-400",
};

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [emailStatus, setEmailStatus] = useState("all");
  const [country, setCountry] = useState("all");
  const [industry, setIndustry] = useState("all");
  const [keywords, setKeywords] = useState("");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBulkStageDialog, setShowBulkStageDialog] = useState(false);
  const [bulkStage, setBulkStage] = useState<string>("enriched");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const LIMIT = 50;

  const { data, isLoading } = trpc.contacts.list.useQuery({
    search: search || undefined,
    stage: stage !== "all" ? stage : undefined,
    emailStatus: emailStatus !== "all" ? emailStatus : undefined,
    country: country !== "all" ? country : undefined,
    industry: industry !== "all" ? industry : undefined,
    keywords: keywords.trim() || undefined,
    limit: LIMIT,
    offset: page * LIMIT,
  });
  const { data: filterOptions } = trpc.contacts.filterOptions.useQuery();

  const deleteMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success(`Deleted ${selectedIds.length} contact(s)`);
      setSelectedIds([]);
      utils.contacts.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkStageMutation = trpc.contacts.bulkUpdateStage.useMutation({
    onSuccess: () => {
      toast.success("Stage updated");
      setSelectedIds([]);
      setShowBulkStageDialog(false);
      utils.contacts.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/import/csv", { method: "POST", body: formData });
      const result = await res.json();
      if (result.success) {
        toast.success(`Imported ${result.imported} contacts (${result.skipped} skipped)`);
        utils.contacts.list.invalidate();
      } else {
        toast.error(result.error ?? "Import failed");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const contacts = data?.contacts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map(c => c.id));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Contacts</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{total.toLocaleString()} contacts in pipeline</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />Add Contact
            </Button>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="bg-primary text-primary-foreground"
            >
              {isImporting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Import CSV
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </div>
        </div>

        {/* Filters */}
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, company..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9 bg-muted/30 border-border/50"
                />
              </div>
              <Select value={stage} onValueChange={v => { setStage(v); setPage(0); }}>
                <SelectTrigger className="w-44 bg-muted/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={emailStatus} onValueChange={v => { setEmailStatus(v); setPage(0); }}>
                <SelectTrigger className="w-44 bg-muted/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={country} onValueChange={v => { setCountry(v); setPage(0); }}>
                <SelectTrigger className="w-44 bg-muted/30 border-border/50">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {(filterOptions?.countries ?? []).map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={industry} onValueChange={v => { setIndustry(v); setPage(0); }}>
                <SelectTrigger className="w-44 bg-muted/30 border-border/50">
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Industries</SelectItem>
                  {(filterOptions?.industries ?? []).map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative min-w-56">
                <Input
                  placeholder="Keywords (custom)"
                  value={keywords}
                  onChange={e => { setKeywords(e.target.value); setPage(0); }}
                  className="bg-muted/30 border-border/50"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={() => setShowBulkStageDialog(true)}>
                <Tag className="h-3 w-3 mr-1" />Update Stage
              </Button>
              <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate({ ids: selectedIds })}>
                <Trash2 className="h-3 w-3 mr-1" />Delete
              </Button>
            </div>
          </div>
        )}

        {/* Contacts Table */}
        <Card className="border-border/50 bg-card/80">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="p-4 w-10">
                    <Checkbox
                      checked={contacts.length > 0 && selectedIds.length === contacts.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact</th>
                  <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                  <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                  <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Stage</th>
                  <th className="p-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Location</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="p-4">
                          <div className="h-4 bg-muted/40 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No contacts found</p>
                      <p className="text-sm mt-1">Import a CSV from Apollo or LinkedIn to get started</p>
                    </td>
                  </tr>
                ) : (
                  contacts.map(contact => (
                    <tr key={contact.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <Checkbox
                          checked={selectedIds.includes(contact.id)}
                          onCheckedChange={() => toggleSelect(contact.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="text-sm font-medium">{contact.fullName ?? (`${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "—")}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{contact.title ?? "—"}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate max-w-32">{contact.company ?? "—"}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm truncate max-w-40 block">{contact.title ?? "—"}</span>
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          <p className="text-sm truncate max-w-48">{contact.email ?? "—"}</p>
                          {contact.emailStatus && contact.emailStatus !== "unknown" && (
                            <Badge className={`text-xs px-1.5 py-0 ${EMAIL_STATUS_COLORS[contact.emailStatus] ?? ""}`}>
                              {contact.emailStatus}
                              {contact.emailConfidence != null && ` ${Math.round(contact.emailConfidence * 100)}%`}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge className={`text-xs border ${STAGE_COLORS[contact.stage] ?? ""}`}>
                          {contact.stage.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          {contact.location && <MapPin className="h-3 w-3 shrink-0" />}
                          <span className="text-sm truncate max-w-28">{contact.location ?? "—"}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border/50">
              <p className="text-sm text-muted-foreground">
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Bulk Stage Dialog */}
        <Dialog open={showBulkStageDialog} onOpenChange={setShowBulkStageDialog}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Update Stage for {selectedIds.length} contacts</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Label>New Stage</Label>
              <Select value={bulkStage} onValueChange={setBulkStage}>
                <SelectTrigger className="mt-2 bg-muted/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.filter(o => o.value !== "all").map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkStageDialog(false)}>Cancel</Button>
              <Button onClick={() => bulkStageMutation.mutate({ ids: selectedIds, stage: bulkStage as any })}>
                Update Stage
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Contact Dialog */}
        <AddContactDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} onSuccess={() => utils.contacts.list.invalidate()} />
      </div>
    </DashboardLayout>
  );
}

function AddContactDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    title: "",
    company: "",
    industry: "",
    country: "",
    location: "",
    keywords: "",
    linkedinUrl: "",
    notes: "",
  });
  const createMutation = trpc.contacts.create.useMutation({
    onSuccess: () => {
      toast.success("Contact added");
      onClose();
      onSuccess();
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        title: "",
        company: "",
        industry: "",
        country: "",
        location: "",
        keywords: "",
        linkedinUrl: "",
        notes: "",
      });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          {[
            { key: "firstName", label: "First Name" },
            { key: "lastName", label: "Last Name" },
            { key: "email", label: "Email", colSpan: true },
            { key: "title", label: "Job Title" },
            { key: "company", label: "Company" },
            { key: "industry", label: "Industry" },
            { key: "country", label: "Country" },
            { key: "location", label: "Location" },
            { key: "keywords", label: "Keywords (comma separated)", colSpan: true },
            { key: "linkedinUrl", label: "LinkedIn URL", colSpan: true },
          ].map(({ key, label, colSpan }) => (
            <div key={key} className={colSpan ? "col-span-2" : ""}>
              <Label className="text-xs">{label}</Label>
              <Input className="mt-1 bg-muted/30 border-border/50 h-8 text-sm" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea className="mt-1 bg-muted/30 border-border/50 text-sm" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const location = [form.location.trim(), form.country.trim()].filter(Boolean).join(", ");
              const tags = form.keywords
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
              createMutation.mutate({
                firstName: form.firstName || undefined,
                lastName: form.lastName || undefined,
                email: form.email || undefined,
                title: form.title || undefined,
                company: form.company || undefined,
                industry: form.industry || undefined,
                location: location || undefined,
                linkedinUrl: form.linkedinUrl || undefined,
                notes: form.notes || undefined,
                tags,
              });
            }}
            disabled={createMutation.isPending}
          >
            Add Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
