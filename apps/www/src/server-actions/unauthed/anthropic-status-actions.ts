"use server";

// import { redis } from "@/lib/redis";

// const ANTHROPIC_STATUS_KEY = "anthropic-status:summary";
// const ANTHROPIC_STATUS_TTL = 60; // 1 minute in seconds
// const ANTHROPIC_STATUS_URL = "https://status.anthropic.com/api/v2/summary.json";

// interface AnthropicComponent {
//   id: string;
//   name: string;
//   status: string;
//   created_at: string;
//   updated_at: string;
//   position: number;
//   description: string | null;
//   showcase: boolean;
//   start_date: string | null;
//   group_id: string | null;
//   page_id: string;
//   group: boolean;
//   only_show_if_degraded: boolean;
// }

// interface AnthropicStatusResponse {
//   page: {
//     id: string;
//     name: string;
//     url: string;
//   };
//   status: {
//     indicator: string;
//     description: string;
//   };
//   components: AnthropicComponent[];
// }

export interface AnthropicStatusResult {
  hasClaudeCodeOutage: boolean;
  outageImpact: "none" | "minor" | "major" | "critical";
  claudeCodeStatus: string;
}

export async function getAnthropicStatusAction(): Promise<AnthropicStatusResult | null> {
  return {
    hasClaudeCodeOutage: false,
    outageImpact: "none",
    claudeCodeStatus: "operational",
  };
  // try {
  //   // Check cache first
  //   const cached = await redis.get<AnthropicStatusResult>(ANTHROPIC_STATUS_KEY);
  //   if (cached) {
  //     return cached;
  //   }

  //   // Fetch from API if cache expired
  //   const response = await fetch(ANTHROPIC_STATUS_URL, {
  //     headers: {
  //       Accept: "application/json",
  //     },
  //     // Don't cache the fetch itself, we'll handle caching with Redis
  //     cache: "no-store",
  //   });

  //   if (!response.ok) {
  //     console.error("Failed to fetch Anthropic status:", response.status);
  //     return null;
  //   }

  //   const data: AnthropicStatusResponse = await response.json();

  //   // Find Claude Code component
  //   const claudeCodeComponent = data.components.find(
  //     (component) =>
  //       component.name.toLowerCase().includes("claude code") ||
  //       (component.description &&
  //         component.description.toLowerCase().includes("claude code")),
  //   );

  //   if (!claudeCodeComponent) {
  //     // If Claude Code component not found, assume no outage
  //     return {
  //       hasClaudeCodeOutage: false,
  //       outageImpact: "none",
  //       claudeCodeStatus: "operational",
  //     };
  //   }

  //   // Determine impact based on component status
  //   let impact: "none" | "minor" | "major" | "critical" = "none";
  //   const hasOutage = claudeCodeComponent.status !== "operational";

  //   if (hasOutage) {
  //     switch (claudeCodeComponent.status) {
  //       case "degraded_performance":
  //       case "partial_outage":
  //         impact = "minor";
  //         break;
  //       case "major_outage":
  //         impact = "major";
  //         break;
  //       default:
  //         // For any other non-operational status, assume minor impact
  //         impact = "minor";
  //     }
  //   }

  //   const result: AnthropicStatusResult = {
  //     hasClaudeCodeOutage: hasOutage,
  //     outageImpact: impact,
  //     claudeCodeStatus: claudeCodeComponent.status,
  //   };

  //   // Cache the result
  //   await redis.set(ANTHROPIC_STATUS_KEY, result, {
  //     ex: ANTHROPIC_STATUS_TTL,
  //   });

  //   return result;
  // } catch (error) {
  //   console.error("Failed to get Anthropic status:", error);
  //   return null;
  // }
}
