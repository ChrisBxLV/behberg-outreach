import { Progress } from "@/components/ui/progress";

export function Funnel({
  sent,
  opened,
  replied,
  positive,
}: {
  sent: number;
  opened: number;
  replied: number;
  positive: number;
}) {
  const step = (label: string, value: number) => {
    const percent = sent > 0 ? Math.round((value / sent) * 100) : 0;
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            {value.toLocaleString()} {sent > 0 ? `· ${percent}%` : ""}
          </p>
        </div>
        <Progress value={percent} className="h-2" />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {step("Sent", sent)}
      {step("Opened (unique)", opened)}
      {step("Replied (unique)", replied)}
      {step("Positive", positive)}
    </div>
  );
}

