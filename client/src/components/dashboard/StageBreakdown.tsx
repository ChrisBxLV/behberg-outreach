import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type Row = { stage: string; count: number };

const stageLabel: Record<string, string> = {
  new: "New",
  enriched: "Enriched",
  in_sequence: "In sequence",
  replied: "Replied",
  closed: "Closed",
  unsubscribed: "Unsubscribed",
};

export function StageBreakdown({ data }: { data: Row[] }) {
  const normalized = [...data]
    .map(r => ({ ...r, stage: stageLabel[r.stage] ?? r.stage }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={normalized} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="stage"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Bar dataKey="count" name="Contacts" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

