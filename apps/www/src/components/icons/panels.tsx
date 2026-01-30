import { cn } from "@/lib/utils";

export function PanelRight({
  className,
  isOpen,
}: {
  className?: string;
  isOpen?: boolean;
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
      className={cn(
        "lucide lucide-panel-right-icon lucide-panel-right",
        className,
      )}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
      {isOpen && (
        <rect
          width="6"
          height="18"
          x="15"
          y="3"
          fill="currentColor"
          rx="2"
          opacity="1"
        />
      )}
    </svg>
  );
}

export function PanelBottom({
  className,
  isOpen,
}: {
  className?: string;
  isOpen?: boolean;
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
      className={cn(
        "lucide lucide-panel-bottom-icon lucide-panel-bottom",
        className,
      )}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 15h18" />
      {isOpen && (
        <rect
          width="18"
          height="6"
          x="3"
          y="15"
          fill="currentColor"
          rx="2"
          opacity="1"
        />
      )}
    </svg>
  );
}
