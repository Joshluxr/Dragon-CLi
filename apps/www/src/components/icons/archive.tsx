import { cn } from "@/lib/utils";

export function ArchiveIcon({
  className,
  isOff = false,
}: {
  className?: string;
  isOff?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide lucide-archive-icon lucide-archive", {
        className,
        "opacity-50": isOff,
      })}
    >
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
      {isOff && <path d="m2 2 20 20" strokeWidth="2" />}
    </svg>
  );
}
