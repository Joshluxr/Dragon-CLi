import React, { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import { useThreads } from "../hooks/useApi.js";
import { useCurrentGitHubRepo } from "../hooks/useGitInfo.js";
import { getApiKey } from "../utils/config.js";

export function ListCommand() {
  const { exit } = useApp();
  const repoQuery = useCurrentGitHubRepo();
  const currentRepo = repoQuery.data;
  const {
    data: threads = [],
    isLoading,
    error,
  } = useThreads(currentRepo || undefined);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Check for API key first
    const checkAuth = async () => {
      const apiKey = await getApiKey();
      if (!apiKey) {
        setAuthError("Not authenticated. Run 'terry auth' first.");
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (authError) {
      exit();
    }
  }, [authError, exit]);

  useEffect(() => {
    if (error) {
      exit();
    }
  }, [error, exit]);

  useEffect(() => {
    if (!isLoading && threads) {
      exit();
    }
  }, [threads, isLoading, exit]);

  // Handle authentication error
  if (authError) {
    return (
      <Box>
        <Text color="red">Error: {authError}</Text>
      </Box>
    );
  }

  // Handle API error
  if (error) {
    return (
      <Box>
        <Text color="red">
          Error: {error instanceof Error ? error.message : String(error)}
        </Text>
      </Box>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Box>
        <Text>Loading tasks...</Text>
      </Box>
    );
  }

  // Display threads
  return (
    <Box flexDirection="column">
      {threads.map((thread, index) => (
        <Box key={thread.id} flexDirection="column" marginBottom={1}>
          <Box>
            <Text dimColor>Task ID </Text>
            <Text>{thread.id}</Text>
          </Box>
          <Box>
            <Text dimColor>Name </Text>
            <Text>{thread.name || "Untitled"}</Text>
          </Box>
          <Box>
            <Text dimColor>Branch </Text>
            <Text>{thread.branchName || "N/A"}</Text>
          </Box>
          <Box>
            <Text dimColor>Repository </Text>
            <Text>{thread.githubRepoFullName || "N/A"}</Text>
          </Box>
          <Box>
            <Text dimColor>PR Number </Text>
            <Text>
              {thread.githubPRNumber ? `#${thread.githubPRNumber}` : "N/A"}
            </Text>
          </Box>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text>
          Total: {threads.length} task{threads.length !== 1 ? "s" : ""}
        </Text>
      </Box>
    </Box>
  );
}
