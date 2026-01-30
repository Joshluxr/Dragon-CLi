"use client";

import { useState } from "react";
import { Monitor, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConsoleLog {
  type: "log" | "warn" | "error" | "info";
  text: string;
  timestamp: number;
}

export interface BrowserScreenshotResult {
  success: boolean;
  screenshot?: string;
  console?: ConsoleLog[];
  pageTitle?: string;
  pageUrl?: string;
  error?: string;
}

export function BrowserScreenshot({
  result,
}: {
  result: BrowserScreenshotResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showConsole, setShowConsole] = useState(false);

  if (!result.screenshot && !result.error) return null;

  return (
    <div className="my-2 rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground border-b">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          <span>Browser Screenshot</span>
          {result.pageTitle && (
            <span className="text-xs truncate max-w-[200px]">
              - {result.pageTitle}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="h-6 px-2"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Expand
            </>
          )}
        </Button>
      </div>

      {result.error ? (
        <div className="p-3 text-sm text-red-500">{result.error}</div>
      ) : (
        <>
          <div
            className={cn(
              "overflow-hidden transition-all",
              expanded ? "max-h-none" : "max-h-64",
            )}
          >
            {result.screenshot && (
              <img
                src={`data:image/png;base64,${result.screenshot}`}
                alt={result.pageTitle || "Browser screenshot"}
                className="w-full"
              />
            )}
          </div>

          {result.console && result.console.length > 0 && (
            <div className="border-t">
              <button
                onClick={() => setShowConsole(!showConsole)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50"
              >
                <span>Console Logs ({result.console.length})</span>
                {showConsole ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {showConsole && (
                <div className="bg-muted p-2 max-h-48 overflow-y-auto">
                  {result.console.map((log, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-xs font-mono py-0.5",
                        log.type === "error" && "text-red-500",
                        log.type === "warn" && "text-yellow-500",
                        log.type === "info" && "text-blue-500",
                      )}
                    >
                      <span className="opacity-50">[{log.type}]</span>{" "}
                      {log.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
