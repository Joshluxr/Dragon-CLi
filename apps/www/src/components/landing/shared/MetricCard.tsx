"use client";

export default function MetricCard({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="relative z-10 p-4 rounded-lg border bg-card text-card-foreground hover:bg-muted/50 hover:shadow-lg transition-all">
      <div className="text-center space-y-1">
        <div className="text-2xl font-semibold text-muted-foreground">
          {value}
        </div>
        <p className="text-sm text-muted-foreground font-mono">{label}</p>
      </div>
    </div>
  );
}
