import type { Story, StoryDefault } from "@ladle/react";
import { RecommendedTasks } from "../recommended-tasks";

export default {
  title: "Components/ThreadList/RecommendedTasksSection",
} satisfies StoryDefault;

export const Default: Story = () => {
  const handleTaskSelect = (prompt: string) => {
    console.log("Selected prompt:", prompt);
  };

  return (
    <div className="w-full max-w-2xl">
      <RecommendedTasks onTaskSelect={handleTaskSelect} />
    </div>
  );
};

export const Interactive: Story = () => {
  const handleTaskSelect = (prompt: string) => {
    alert(`Selected prompt: ${prompt.substring(0, 50)}...`);
  };

  return (
    <div className="w-full max-w-2xl">
      <RecommendedTasks onTaskSelect={handleTaskSelect} />
    </div>
  );
};

export const DarkMode: Story = () => {
  const handleTaskSelect = (prompt: string) => {
    console.log("Selected prompt:", prompt);
  };

  return (
    <div className="w-full max-w-2xl dark bg-background p-4">
      <RecommendedTasks onTaskSelect={handleTaskSelect} />
    </div>
  );
};
