"use client";

import {
  Terminal,
  Container,
  Bot,
  Workflow,
  Blocks,
  PlusIcon,
  Cloud,
} from "lucide-react";
import Image from "next/image";
import { OpenAIIcon } from "@/components/icons/openai";
import { MultiTaskVisual } from "@/components/landing/widgets/MultiTaskVisual";
import { TerryPullTerminal } from "@/components/landing/widgets/TerryPullTerminal";
import { AutomationsVisual } from "@/components/landing/widgets/AutomationsVisual";
import { IntegrationsVisual } from "@/components/landing/widgets/IntegrationsVisual";
import { WorkAnywhere } from "@/components/landing/widgets/WorkAnywhere";
import { cn } from "@/lib/utils";

function FeatureBox({
  icon,
  label,
  heading,
  description,
  className,
  visual,
}: {
  icon: React.ReactNode;
  label: string;
  heading: string;
  description: React.ReactNode;
  className?: string;
  visual?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "p-4 sm:p-6 md:p-8 overflow-hidden relative border-r border-b border-border/30",
        className,
      )}
    >
      <div className="relative z-10 space-y-2 sm:space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-xs sm:text-sm">
          {icon}
          <span>{label}</span>
        </div>

        <div className="text-lg sm:text-xl md:text-2xl inline-block">
          <h3 className="font-bold inline">{heading}</h3>
          &nbsp;
          <div className="text-muted-foreground">{description}</div>
        </div>

        {/* Visual content */}
        {visual}
      </div>
    </div>
  );
}

export default function BentoFeatures() {
  return (
    <section id="features" className="relative py-8 pb-8">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-l border-t border-border/30">
          <FeatureBox
            icon={<Bot className="size-4" />}
            label="AI Coding Agents"
            heading="Use all the best agents"
            description="Choose from Claude Code, OpenAI Codex, Gemini, OpenCode, Amp and more."
            visual={
              <div className="mt-4 sm:mt-6 py-4 flex items-center justify-center">
                <div className="flex gap-2 sm:gap-4">
                  <div className="size-16 sm:size-20 rounded-xl sm:rounded-2xl bg-background border border-border/50 flex items-center justify-center">
                    <Image
                      src="/agents/claude-logo.svg"
                      alt="Claude Code"
                      width={32}
                      height={32}
                      className="sm:w-10 sm:h-10"
                    />
                  </div>
                  <div className="size-16 sm:size-20 rounded-xl sm:rounded-2xl bg-background border border-border/50 flex items-center justify-center">
                    <OpenAIIcon className="size-8 sm:size-10 text-foreground" />
                  </div>
                  <div className="size-16 sm:size-20 rounded-xl sm:rounded-2xl bg-background border border-border/50 flex items-center justify-center">
                    <Image
                      src="/agents/opencode.jpg"
                      alt="OpenCode"
                      width={32}
                      height={32}
                      className="sm:w-10 sm:h-10"
                    />
                  </div>
                  <div className="size-16 sm:size-20 rounded-xl sm:rounded-2xl bg-background border border-border/50 flex items-center justify-center">
                    <Image
                      src="/agents/gemini.png"
                      alt="Gemini"
                      width={32}
                      height={32}
                      className="sm:w-10 sm:h-10"
                    />
                  </div>
                  <div className="size-16 sm:size-20 rounded-xl sm:rounded-2xl bg-background border border-border/50 flex items-center justify-center">
                    <Image
                      src="/ampcode.svg"
                      alt="Amp Code"
                      width={32}
                      height={32}
                      className="sm:w-10 sm:h-10"
                    />
                  </div>
                  <div className="size-16 sm:size-20 rounded-xl sm:rounded-2xl bg-background border border-dashed border-border/50 flex items-center justify-center">
                    <PlusIcon className="size-6 sm:size-8 text-muted-foreground" />
                  </div>
                </div>
              </div>
            }
            className="md:col-span-2 overflow-hidden"
          />
          <FeatureBox
            icon={<Cloud className="size-4" />}
            label="Runs in the Cloud"
            heading="Work from anywhere"
            description="Terragon works from your phone and lets you work wherever you are"
            visual={<WorkAnywhere />}
          />
          <FeatureBox
            icon={<Container className="size-4" />}
            label="Isolated Development Environments"
            heading="Work on multiple tasks without conflicts"
            description="Each agent runs in an isolated environment to plan, build and test its work."
            visual={<MultiTaskVisual />}
          />
          <FeatureBox
            icon={<Blocks className="size-4" />}
            label="Integrations"
            heading="Works with the tools you already use"
            description="Seamlessly delegate work from GitHub, Slack and more."
            className="md:col-span-2 overflow-hidden"
            visual={<IntegrationsVisual />}
          />
          <FeatureBox
            icon={<Terminal className="size-4" />}
            label="terry cli"
            heading="Take control locally"
            description="Pull tasks to your local environment when they need your attention. Kick off tasks directly from the CLI."
            visual={<TerryPullTerminal />}
          />
          <FeatureBox
            icon={<Workflow className="size-4" />}
            label="Automations"
            heading="Offload repetitive tasks"
            description="Recurring tasks or event-triggered workflows let you focus on what matters."
            visual={<AutomationsVisual />}
          />
        </div>
      </div>
    </section>
  );
}
