import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CampaignRow = {
  id: number;
  name: string;
  sent: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
};

function RateBadge({ value, tone }: { value: number; tone: "good" | "warn" | "bad" }) {
  const cls =
    tone === "good"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : "bg-red-500/15 text-red-300 border-red-500/30";
  return <Badge className={cn("text-xs border", cls)}>{value}%</Badge>;
}

export function TopCampaignsTable({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: CampaignRow[];
  onOpen: (id: number) => void;
}) {
  if (!rows.length) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No campaign activity in this range.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">Sent · Open · Reply · Bounce</p>
      </div>
      <div className="divide-y divide-border/60 rounded-lg border border-border/50 bg-muted/10">
        {rows.map(r => (
          <button
            key={r.id}
            onClick={() => onOpen(r.id)}
            className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{r.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{r.sent.toLocaleString()} sent</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <RateBadge value={r.openRate} tone={r.openRate >= 40 ? "good" : r.openRate >= 20 ? "warn" : "bad"} />
              <RateBadge value={r.replyRate} tone={r.replyRate >= 8 ? "good" : r.replyRate >= 3 ? "warn" : "bad"} />
              <RateBadge value={r.bounceRate} tone={r.bounceRate <= 2 ? "good" : r.bounceRate <= 5 ? "warn" : "bad"} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

