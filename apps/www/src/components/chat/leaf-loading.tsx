import { memo } from "react";
import { Leaf } from "lucide-react";

const LeafLoading = memo(function LeafLoading({
  message = "Loading",
}: {
  message?: string | React.ReactNode;
}) {
  return (
    <div className="flex gap-2 px-2 text-muted-foreground">
      <div className="animate-[sway_3s_ease-in-out_infinite] pt-1">
        <Leaf className="h-4 w-4" />
      </div>
      <span className="flex items-center gap-1">{message}</span>
    </div>
  );
});

export { LeafLoading };
