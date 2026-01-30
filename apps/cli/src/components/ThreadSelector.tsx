import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useThreads } from "../hooks/useApi.js";

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

interface ThreadSelectorProps {
  onSelect: (threadId: string) => void;
  currentRepo?: string;
}

export function ThreadSelector({ onSelect, currentRepo }: ThreadSelectorProps) {
  const [page, setPage] = useState(0);
  const { data: threads = [], isLoading, error } = useThreads(currentRepo);

  const ITEMS_PER_PAGE = 10;

  const totalPages = Math.ceil(threads.length / ITEMS_PER_PAGE);
  const startIndex = page * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, threads.length);
  const visibleThreads = threads.slice(startIndex, endIndex);

  const items = visibleThreads.map((thread) => {
    const unreadIndicator = thread.isUnread ? "● " : "  ";
    const threadName = thread.name || "Untitled";
    const date = new Date(thread.updatedAt);
    const timeAgo = getTimeAgo(date);

    // Simple format: just title and time
    const label = `${unreadIndicator}${threadName} • ${timeAgo}`;

    return {
      label,
      value: thread.id,
    };
  });

  useInput((_input, key) => {
    if (!isLoading && !error && threads.length > 0) {
      if (key.leftArrow && page > 0) {
        setPage(page - 1);
      } else if (key.rightArrow && page < totalPages - 1) {
        setPage(page + 1);
      }
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text>Loading tasks...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">
          {error instanceof Error ? error.message : String(error)}
        </Text>
      </Box>
    );
  }

  if (threads.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>
          {currentRepo
            ? "No tasks found for the current repository."
            : "No tasks found."}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Select a task to pull:</Text>
      </Box>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      {totalPages > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {page + 1} of {totalPages} (← → to navigate pages, ↑ ↓ to
            select)
          </Text>
        </Box>
      )}
    </Box>
  );
}
