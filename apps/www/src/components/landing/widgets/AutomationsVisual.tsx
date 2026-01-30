"use client";

import { useEffect, useState } from "react";
import { Clock, GitPullRequest } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function AutomationsVisual() {
  const [flowProgress, setFlowProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [nodePositions, setNodePositions] = useState({
    trigger: { x: 40, y: 10 },
    agent: { x: 240, y: 100 },
    pr: { x: 40, y: 190 },
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Detect mobile screen size and container width
  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      setIsMobile(width < 640);
      // Get the actual container width (account for padding)
      const container = document.querySelector(".automation-flow-container");
      if (container) {
        setContainerWidth(container.clientWidth);
      }
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  // Adjust positions based on container width
  useEffect(() => {
    if (containerWidth === 0) return;

    const nodeWidth = isMobile ? 128 : 176; // w-32 = 128px, w-44 = 176px
    const padding = isMobile ? 12 : 24; // p-3 = 12px, p-6 = 24px
    const availableWidth = containerWidth - padding * 2;

    if (isMobile) {
      // On mobile, use more of the available width
      const leftMargin = Math.max(10, (availableWidth - nodeWidth) * 0.1);
      const rightMargin = Math.max(10, availableWidth - nodeWidth - leftMargin);

      setNodePositions({
        trigger: { x: leftMargin, y: 10 },
        agent: { x: availableWidth - nodeWidth - rightMargin, y: 100 },
        pr: { x: leftMargin, y: 190 },
      });
    } else {
      // Desktop: center-align with some spacing
      const leftMargin = Math.max(40, (availableWidth - nodeWidth * 2) * 0.2);
      const agentX = availableWidth - nodeWidth - leftMargin;

      setNodePositions({
        trigger: { x: leftMargin, y: 10 },
        agent: { x: agentX, y: 100 },
        pr: { x: leftMargin, y: 190 },
      });
    }
  }, [isMobile, containerWidth]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFlowProgress((prev) => (prev + 1) % 100);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Animate through the steps with pause at the end
  useEffect(() => {
    const animateSteps = () => {
      setActiveStep((prev) => {
        const next = (prev + 1) % 4;
        // If we just completed step 3 (PR), schedule the reset after a longer pause
        if (next === 0) {
          setTimeout(() => setActiveStep(0), 2000);
          return 3; // Stay on step 3 for the pause
        }
        return next;
      });
    };

    const stepInterval = setInterval(animateSteps, 1200);
    return () => clearInterval(stepInterval);
  }, []);

  const handleMouseDown = (
    e: React.MouseEvent,
    nodeId: string,
    currentX: number,
    currentY: number,
  ) => {
    setDragging(nodeId);
    setDragOffset({
      x: e.clientX - currentX,
      y: e.clientY - currentY,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      setNodePositions((prev) => ({
        ...prev,
        [dragging]: { x: newX, y: newY },
      }));
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  // Animated edge path
  const AnimatedEdge = ({
    x1,
    y1,
    x2,
    y2,
    isActive,
    isCompleted,
  }: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isActive: boolean;
    isCompleted: boolean;
  }) => {
    const midY = (y1 + y2) / 2;
    const cornerRadius = 8;

    // Create rounded corners using quadratic bezier curves
    const path = `
      M ${x1} ${y1}
      L ${x1} ${midY - cornerRadius}
      Q ${x1} ${midY} ${x1 + (x2 > x1 ? cornerRadius : -cornerRadius)} ${midY}
      L ${x2 - (x2 > x1 ? cornerRadius : -cornerRadius)} ${midY}
      Q ${x2} ${midY} ${x2} ${midY + (y2 > midY ? cornerRadius : -cornerRadius)}
      L ${x2} ${y2}
    `.trim();

    return (
      <g>
        {/* Background path */}
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn(
            "transition-colors duration-500",
            isActive || isCompleted ? "text-primary/30" : "text-border/30",
          )}
        />
        {/* Animated flow */}
        {isActive && (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="8 8"
            strokeDashoffset={-flowProgress}
            className="text-primary"
          />
        )}
        {/* Completed state */}
        {isCompleted && !isActive && (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary/60"
          />
        )}
      </g>
    );
  };

  const FlowNode = ({
    icon,
    label,
    sublabel,
    nodeId,
    position,
    isActive,
    isCompleted,
  }: {
    icon: React.ReactNode;
    label: string;
    sublabel: string;
    nodeId: string;
    position: { x: number; y: number };
    isActive: boolean;
    isCompleted: boolean;
  }) => {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-md border shadow-sm cursor-move active:cursor-grabbing transition-all duration-500",
          isActive
            ? "border-primary/50 bg-primary/5 shadow-md"
            : isCompleted
              ? "border-green-500/50 bg-green-500/5 opacity-80"
              : "border-border/50 bg-background opacity-60",
          dragging === nodeId && "shadow-lg scale-105",
        )}
        onMouseDown={(e) => handleMouseDown(e, nodeId, position.x, position.y)}
      >
        <div className="size-4 sm:size-5 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] sm:text-xs font-medium truncate leading-tight">
            {label}
          </div>
          <div className="text-[9px] sm:text-[10px] text-muted-foreground truncate leading-tight">
            {sublabel}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-6 w-full relative flex items-center justify-center p-1 sm:p-2">
      <div className="automation-flow-container rounded-lg w-full max-w-2xl p-3 sm:p-6 relative">
        <div
          className="relative h-64 select-none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* SVG for edges */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <AnimatedEdge
              x1={nodePositions.trigger.x + (isMobile ? 64 : 88)}
              y1={
                nodePositions.trigger.y < nodePositions.agent.y
                  ? nodePositions.trigger.y + (isMobile ? 40 : 48)
                  : nodePositions.trigger.y
              }
              x2={nodePositions.agent.x + (isMobile ? 64 : 88)}
              y2={
                nodePositions.trigger.y < nodePositions.agent.y
                  ? nodePositions.agent.y
                  : nodePositions.agent.y + (isMobile ? 40 : 48)
              }
              isActive={activeStep === 2}
              isCompleted={activeStep > 2}
            />
            <AnimatedEdge
              x1={nodePositions.agent.x + (isMobile ? 64 : 88)}
              y1={
                nodePositions.agent.y < nodePositions.pr.y
                  ? nodePositions.agent.y + (isMobile ? 40 : 48)
                  : nodePositions.agent.y
              }
              x2={nodePositions.pr.x + (isMobile ? 64 : 88)}
              y2={
                nodePositions.agent.y < nodePositions.pr.y
                  ? nodePositions.pr.y
                  : nodePositions.pr.y + (isMobile ? 40 : 48)
              }
              isActive={activeStep === 3}
              isCompleted={false}
            />
          </svg>

          {/* Nodes */}
          <div
            className="absolute w-32 sm:w-44"
            style={{
              left: nodePositions.trigger.x,
              top: nodePositions.trigger.y,
            }}
          >
            <FlowNode
              icon={<Clock className="size-3 sm:size-4 text-primary" />}
              label="Daily at 7am"
              sublabel="Scheduled trigger"
              nodeId="trigger"
              position={nodePositions.trigger}
              isActive={activeStep === 1}
              isCompleted={activeStep > 1}
            />
          </div>

          <div
            className="absolute w-32 sm:w-44"
            style={{
              left: nodePositions.agent.x,
              top: nodePositions.agent.y,
            }}
          >
            <FlowNode
              icon={
                <Image
                  src="/agents/claude-logo.svg"
                  alt="Claude"
                  width={14}
                  height={14}
                  className="sm:w-4 sm:h-4"
                />
              }
              label="Update release notes"
              sublabel="AI writes changelog"
              nodeId="agent"
              position={nodePositions.agent}
              isActive={activeStep === 2}
              isCompleted={activeStep > 2}
            />
          </div>

          <div
            className="absolute w-32 sm:w-44"
            style={{
              left: nodePositions.pr.x,
              top: nodePositions.pr.y,
            }}
          >
            <FlowNode
              icon={
                <GitPullRequest className="size-3 sm:size-4 text-foreground" />
              }
              label="Put up PR"
              sublabel="Opens pull request"
              nodeId="pr"
              position={nodePositions.pr}
              isActive={activeStep === 3}
              isCompleted={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
