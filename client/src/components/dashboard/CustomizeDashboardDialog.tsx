import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type DashboardSectionKey =
  | "trends"
  | "funnel"
  | "pipeline"
  | "deliverability"
  | "topCampaigns"
  | "needsAttention"
  | "quickActions";

export type DashboardSectionsState = Record<DashboardSectionKey, boolean>;

const SECTION_LABELS: Record<DashboardSectionKey, { title: string; desc: string }> = {
  trends: { title: "Trends", desc: "Sent/opens/replies/bounces/unsubs over time." },
  funnel: { title: "Funnel", desc: "Sent → opened → replied → positive, with rates." },
  pipeline: { title: "Pipeline by stage", desc: "Contacts grouped by pipeline stage." },
  deliverability: { title: "Deliverability health", desc: "Bounce rate, unsubscribes, provider breakdowns." },
  topCampaigns: { title: "Top campaigns", desc: "Best performers in the selected range." },
  needsAttention: { title: "Needs attention", desc: "Worst performers in the selected range." },
  quickActions: { title: "Quick actions", desc: "Shortcuts to common tasks." },
};

export function CustomizeDashboardDialog({
  value,
  order,
  onSave,
  onResetDefaults,
}: {
  value: DashboardSectionsState;
  order: DashboardSectionKey[];
  onSave: (next: { sections: DashboardSectionsState; order: DashboardSectionKey[] }) => void;
  onResetDefaults: () => { sections: DashboardSectionsState; order: DashboardSectionKey[] };
}) {
  const [open, setOpen] = useState(false);
  const [draftSections, setDraftSections] = useState<DashboardSectionsState>(value);
  const [draftOrder, setDraftOrder] = useState<DashboardSectionKey[]>(order);

  const hasChanges = useMemo(() => {
    const sectionsChanged =
      (Object.keys(value) as DashboardSectionKey[]).some(k => value[k] !== draftSections[k]);
    const orderChanged =
      order.length !== draftOrder.length ||
      order.some((k, i) => draftOrder[i] !== k);
    return sectionsChanged || orderChanged;
  }, [value, order, draftSections, draftOrder]);

  useEffect(() => {
    if (!open) return;
    setDraftSections(value);
    setDraftOrder(order);
  }, [open, value, order]);

  const move = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= draftOrder.length) return;
    const next = [...draftOrder];
    const [item] = next.splice(idx, 1);
    next.splice(nextIdx, 0, item);
    setDraftOrder(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Customize
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customize dashboard</DialogTitle>
          <DialogDescription>Show or hide sections on your dashboard.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {draftOrder.map((key, idx) => {
            const meta = SECTION_LABELS[key];
            const checked = Boolean(draftSections[key]);
            return (
              <div key={key} className="flex items-start justify-between gap-4 rounded-md border border-border/50 bg-muted/10 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{meta.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{meta.desc}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 px-0"
                      disabled={idx === 0}
                      onClick={() => move(idx, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 px-0"
                      disabled={idx === draftOrder.length - 1}
                      onClick={() => move(idx, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Label>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        setDraftSections({ ...draftSections, [key]: Boolean(next) });
                      }}
                    />
                  </Label>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const next = onResetDefaults();
              setDraftSections(next.sections);
              setDraftOrder(next.order);
            }}
          >
            Reset defaults
          </Button>
          <Button
            type="button"
            disabled={!hasChanges}
            onClick={() => {
              onSave({ sections: draftSections, order: draftOrder });
              setOpen(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

