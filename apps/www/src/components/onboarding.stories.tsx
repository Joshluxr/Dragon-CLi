import type { Story, StoryDefault } from "@ladle/react";
import { Onboarding } from "./onboarding";
import { useEffect, useState } from "react";

export default {
  title: "Onboarding",
} satisfies StoryDefault;

function useOnEscape(callback: () => void) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        callback();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [callback]);
}

export const GitHubOnly: Story = () => {
  const [isDone, setIsDone] = useState(false);
  useOnEscape(() => {
    setIsDone(true);
  });
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Onboarding forceIsDone={isDone} />
    </div>
  );
};
