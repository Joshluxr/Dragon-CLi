import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CodeClickToCopy({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (copied) return;
    navigator.clipboard.writeText(text);
    toast.success("Copied");
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };
  return (
    <code className={cn("font-mono font-bold", className)} onClick={handleCopy}>
      {text}
    </code>
  );
}
