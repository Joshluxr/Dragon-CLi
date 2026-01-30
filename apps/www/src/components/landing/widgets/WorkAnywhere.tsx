import Image from "next/image";
import plantLight from "@/components/shared/plant-light.png";
import plantDark from "@/components/shared/plant-dark.png";

export function WorkAnywhere() {
  return (
    <div className="mt-12 w-full flex items-start justify-center h-[200px]">
      <div className="relative w-64">
        {/* Phone frame */}
        <div className="relative bg-background border border-border rounded-[1.5rem] shadow-lg p-2">
          {/* Screen */}
          <div className="relative bg-muted/20 rounded-[1.5rem] overflow-hidden aspect-[9/19.5]">
            {/* Header */}
            <div className="px-3 pt-3 pb-2 flex items-center gap-2">
              <Image
                src={plantLight}
                alt="Terragon"
                width={14}
                height={14}
                className="block dark:hidden"
              />
              <Image
                src={plantDark}
                alt="Terragon"
                width={14}
                height={14}
                className="hidden dark:block"
              />
              <div className="text-xs font-semibold">Terragon</div>
            </div>

            {/* Prompt box */}
            <div className="mx-3 mt-2 bg-background border border-border rounded-lg px-3 py-4 shadow-sm">
              <div className="text-[10px] text-muted-foreground/80 leading-relaxed mb-3">
                What do you want to build?
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                <div className="text-[8px] px-2 py-0.5 bg-muted/50 rounded">
                  GPT-5
                </div>
                <div className="size-3 rounded-sm bg-muted/30"></div>
                <div className="flex-1"></div>
                <div className="size-3 rounded-sm bg-muted/30"></div>
                <div className="size-3 rounded-sm bg-muted/30"></div>
                <div className="size-3 rounded-sm bg-muted/30"></div>
                <div className="px-2 py-1 bg-primary/80 text-primary-foreground rounded text-[9px] font-bold">
                  ↵
                </div>
              </div>
            </div>

            {/* Repo selector */}
            <div className="mx-3 mt-2 flex items-center gap-2 text-[9px] text-muted-foreground">
              <div className="truncate">terragon-labs/terragon</div>
              <div className="px-2 py-0.5 bg-muted/30 rounded ml-auto">
                main
              </div>
            </div>

            {/* Tasks list */}
            <div className="mx-3 mt-3 space-y-1.5">
              <div className="flex items-center gap-2 text-[9px]">
                <div className="size-1.5 rounded-full bg-foreground"></div>
                <div className="truncate">Fix login bug</div>
              </div>
              <div className="flex items-center gap-2 text-[9px] opacity-60">
                <div className="size-1.5 rounded-full bg-foreground"></div>
                <div className="truncate">Update documentation</div>
              </div>
              <div className="flex items-center gap-2 text-[9px] opacity-40">
                <div className="size-1.5 rounded-full bg-foreground"></div>
                <div className="truncate">Add dark mode toggle</div>
              </div>
            </div>
          </div>
        </div>
        {/* Home indicator */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-muted-foreground/20 rounded-full"></div>
      </div>
    </div>
  );
}
