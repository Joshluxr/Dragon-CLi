"use client";

import { useEffect, useRef, useState } from "react";
import { GithubIcon } from "@/components/icons/github";
import { SlackIcon } from "@/components/icons/slack";
import { LinearIcon } from "@/components/icons/linear";
import { JiraIcon } from "@/components/icons/jira";

function ScrollingRow({
  integrations,
  speed,
  direction,
}: {
  integrations: Array<{
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    action: string;
  }>;
  speed: number;
  direction: "left" | "right";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const widthRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const calculateWidth = () => {
      const children = scrollContainer.children;
      if (children.length > 0) {
        const thirdLength = children.length / 3;
        const first = children[0] as HTMLElement;
        const repeat = children[thirdLength] as HTMLElement;
        const firstRect = first.getBoundingClientRect();
        const repeatRect = repeat.getBoundingClientRect();
        const totalWidth = repeatRect.left - firstRect.left;
        widthRef.current = totalWidth;
      }
    };

    const timeoutId = window.setTimeout(calculateWidth, 50);
    const resizeObserver = new ResizeObserver(() => calculateWidth());
    resizeObserver.observe(scrollContainer);

    let animationId: number;

    const tick = (now: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = now;
      const deltaMs = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (!isPaused && widthRef.current > 0) {
        const deltaSec = deltaMs / 1000;
        const loopWidth = widthRef.current;
        const dpr = window.devicePixelRatio || 1;

        if (direction === "right") {
          scrollPosRef.current -= speed * deltaSec;
          if (scrollPosRef.current < 0) {
            const wrapped =
              ((scrollPosRef.current % loopWidth) + loopWidth) % loopWidth;
            scrollPosRef.current = Math.round(wrapped * dpr) / dpr;
          }
        } else {
          scrollPosRef.current += speed * deltaSec;
          if (scrollPosRef.current >= loopWidth) {
            const remainder = scrollPosRef.current % loopWidth;
            scrollPosRef.current = Math.round(remainder * dpr) / dpr;
          }
        }
        scrollContainer.style.transform = `translate3d(-${scrollPosRef.current}px, 0, 0)`;
      }

      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      window.clearTimeout(timeoutId);
      lastTimeRef.current = null;
    };
  }, [speed, direction, isPaused]);

  return (
    <div
      className="relative overflow-x-clip group py-2"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div ref={scrollRef} className="flex gap-4 will-change-transform">
        {[...integrations, ...integrations, ...integrations].map(
          (integration, index) => (
            <div
              key={index}
              className="flex-shrink-0 w-56 bg-background border border-border/50 rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-2 mb-2">
                {integration.icon}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium mb-1 truncate">
                    {integration.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {integration.subtitle}
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-border/30">
                <div className="text-xs truncate">
                  {integration.action === "Coming soon" ? (
                    <span className="text-muted-foreground italic">
                      Coming soon
                    </span>
                  ) : (
                    <>
                      <span className="text-primary font-medium">
                        {integration.action.split(" ")[0]}
                      </span>{" "}
                      <span className="text-foreground">
                        {integration.action.split(" ").slice(1).join(" ")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function IntegrationsVisual() {
  const integrations = [
    {
      icon: <GithubIcon className="size-5" />,
      title: "GitHub Issue #42",
      subtitle: "Fix login redirect bug",
      action: "@terragon-labs please fix this",
    },
    {
      icon: <SlackIcon className="size-5" />,
      title: "#engineering",
      subtitle: "Sarah Johnson 2:34 PM",
      action: "@terragon update hero section",
    },
    {
      icon: <LinearIcon className="size-5" />,
      title: "Linear Issue LIN-234",
      subtitle: "Update user permissions",
      action: "Coming soon",
    },
    {
      icon: <JiraIcon className="size-5" />,
      title: "Jira Task PROJ-567",
      subtitle: "Refactor database schema",
      action: "Coming soon",
    },
    {
      icon: <GithubIcon className="size-5" />,
      title: "GitHub PR #128",
      subtitle: "Add authentication",
      action: "@terragon-labs review this",
    },
    {
      icon: <SlackIcon className="size-5" />,
      title: "#product",
      subtitle: "Alex Chen 11:23 AM",
      action: "@terragon implement feature",
    },
    {
      icon: <LinearIcon className="size-5" />,
      title: "Linear Bug LIN-891",
      subtitle: "Fix mobile navigation",
      action: "Coming soon",
    },
    {
      icon: <GithubIcon className="size-5" />,
      title: "GitHub Issue #89",
      subtitle: "Update dependencies",
      action: "@terragon-labs upgrade pkgs",
    },
    {
      icon: <SlackIcon className="size-5" />,
      title: "#backend",
      subtitle: "Jamie Lee 9:15 AM",
      action: "@terragon fix API timeout",
    },
    {
      icon: <JiraIcon className="size-5" />,
      title: "Jira Story PROJ-123",
      subtitle: "API integration",
      action: "Coming soon",
    },
    {
      icon: <GithubIcon className="size-5" />,
      title: "GitHub PR #156",
      subtitle: "Refactor auth flow",
      action: "@terragon-labs optimize this",
    },
    {
      icon: <SlackIcon className="size-5" />,
      title: "#design",
      subtitle: "Morgan Davis 4:45 PM",
      action: "@terragon update button styles",
    },
    {
      icon: <GithubIcon className="size-5" />,
      title: "GitHub PR #201",
      subtitle: "Add dark mode toggle",
      action: "@terragon-labs implement this",
    },
    {
      icon: <SlackIcon className="size-5" />,
      title: "#frontend",
      subtitle: "Taylor Reed 10:30 AM",
      action: "@terragon optimize loading",
    },
  ];

  // Split cards into 2 rows
  const row1 = integrations.slice(0, 7);
  const row2 = integrations.slice(7, 14);

  return (
    <div className="mt-6 w-full relative py-8 space-y-4">
      <ScrollingRow integrations={row1} speed={50} direction="left" />
      <ScrollingRow integrations={row2} speed={60} direction="right" />
    </div>
  );
}
