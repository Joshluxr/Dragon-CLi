import { cn } from "@/lib/utils";

export function Pill({
  label,
  onClick,
  className,
}: {
  label: string | React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  className?: string;
}) {
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full font-medium bg-muted text-muted-foreground border border-border",
        "px-2 py-0.5 text-[11px]",
        className,
      )}
    >
      {label}
    </span>
  );
}
