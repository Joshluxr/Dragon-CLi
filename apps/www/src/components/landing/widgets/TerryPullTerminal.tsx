"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

const fullCommand = "terry pull 1234";
const outputLines: Array<string | { text: string; delay: number }> = [
  { text: "Fetching task...", delay: 2000 },
  "✓ Task fetched successfully",
  "",
  "Name           Add konami code easter egg",
  "Branch         terragon/add-konami-code-easter-egg",
  "Repository     terragon-labs/terragon",
  "PR Number      #1234",
  { text: "", delay: 600 },
  "✓ Task ready for local work",
];

export function TerryPullTerminal() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
        } else {
          // Reset animation when out of view
          setVisible(false);
          setCommand("");
          setOutput([]);
        }
      },
      { threshold: 0.3 },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [mounted]);

  useEffect(() => {
    if (!visible || !mounted) return;

    const timeouts: NodeJS.Timeout[] = [];

    // Type command
    let charIndex = 0;
    const commandInterval = setInterval(() => {
      if (charIndex <= fullCommand.length) {
        setCommand(fullCommand.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(commandInterval);

        // Show output after command is typed
        const outputTimeout = setTimeout(() => {
          let lineIndex = 0;
          let currentDelay = 150;
          const showNextLine = () => {
            if (lineIndex < outputLines.length) {
              const line = outputLines[lineIndex]!;
              const text = typeof line === "string" ? line : line.text;
              const delay =
                typeof line === "string" ? currentDelay : line.delay;
              setOutput((prev) => [...prev, text]);
              lineIndex++;
              const nextTimeout = setTimeout(showNextLine, delay);
              timeouts.push(nextTimeout);
            }
          };

          showNextLine();
        }, 300);
        timeouts.push(outputTimeout);
      }
    }, 30);

    return () => {
      clearInterval(commandInterval);
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, [visible, mounted]);

  const isDark = resolvedTheme === "dark";
  if (!mounted) {
    return null;
  }

  return (
    <div ref={ref} className="mt-6 w-full relative">
      {/* Terminal */}
      <div
        className="rounded-lg border border-border/30 overflow-hidden shadow-2xl font-mono text-sm"
        style={{
          backgroundColor: isDark ? "#1e1e1e" : "#f8f5f0",
        }}
      >
        {/* Terminal content */}
        <div className="p-4 min-h-[300px]">
          {/* Command line */}
          <div className="flex items-center gap-2 mb-4">
            <span style={{ color: isDark ? "#0dbc79" : "#13704a" }}>$</span>
            <span style={{ color: isDark ? "#d4d4d4" : "#1f1f1f" }}>
              {command}
            </span>
            {command && command.length < fullCommand.length && (
              <span
                className="inline-block w-2 h-4 animate-pulse"
                style={{ backgroundColor: isDark ? "#d4d4d4" : "#1f1f1f" }}
              />
            )}
          </div>

          {/* Output */}
          <div className="space-y-1">
            {output.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line?.startsWith("✓")
                    ? isDark
                      ? "#0dbc79"
                      : "#13704a"
                    : line?.startsWith("?")
                      ? isDark
                        ? "#11a8cd"
                        : "#0b6f88"
                      : line?.match(/^\s+\d\./)
                        ? isDark
                          ? "#e5e5e5"
                          : "#3d3d3d"
                        : isDark
                          ? "#9a9a9a"
                          : "#858585",
                }}
              >
                {line || "\u00A0"}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
