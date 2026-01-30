import type { Story, StoryDefault } from "@ladle/react";
import { RecommendedTasks } from "./recommended-tasks";

export default {
  title: "Components/RecommendedTasks",
} satisfies StoryDefault;

export const Default: Story = () => {
  const handleTaskSelect = (prompt: string) => {
    console.log("Selected prompt:", prompt);
  };

  return (
    <div className="p-4 max-w-2xl">
      <h3 className="text-sm font-medium text-muted-foreground/70 mb-2">
        Suggested tasks
      </h3>
      <RecommendedTasks onTaskSelect={handleTaskSelect} />
    </div>
  );
};

export const DarkMode: Story = () => {
  const handleTaskSelect = (prompt: string) => {
    console.log("Selected prompt:", prompt);
  };

  return (
    <div className="p-4 max-w-2xl dark bg-background">
      <h3 className="text-sm font-medium text-muted-foreground/70 mb-2">
        Suggested tasks
      </h3>
      <RecommendedTasks onTaskSelect={handleTaskSelect} />
    </div>
  );
};

export const WithCustomHandler: Story = () => {
  const handleTaskSelect = (prompt: string) => {
    alert(`Selected prompt: ${prompt.substring(0, 50)}...`);
  };

  return (
    <div className="p-4 max-w-2xl">
      <h3 className="text-sm font-medium text-muted-foreground/70 mb-2">
        Suggested tasks
      </h3>
      <RecommendedTasks onTaskSelect={handleTaskSelect} />
    </div>
  );
};
