import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type Point = {
  day: string;
  sent: number;
  uniqueOpens: number;
  uniqueReplies: number;
  bounces: number;
  unsubscribes: number;
};

export function TrendsChart({ data }: { data: Point[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--foreground) / 0.72)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--foreground) / 0.72)" }}
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
          <Legend />
          <Area type="monotone" dataKey="sent" name="Sent" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.18} />
          <Area type="monotone" dataKey="uniqueOpens" name="Opens" stroke="#22c55e" fill="#22c55e" fillOpacity={0.12} />
          <Area type="monotone" dataKey="uniqueReplies" name="Replies" stroke="#a855f7" fill="#a855f7" fillOpacity={0.10} />
          <Area type="monotone" dataKey="bounces" name="Bounces" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.10} />
          <Area type="monotone" dataKey="unsubscribes" name="Unsubs" stroke="#ef4444" fill="#ef4444" fillOpacity={0.08} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

