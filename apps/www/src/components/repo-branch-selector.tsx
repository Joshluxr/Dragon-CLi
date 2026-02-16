"use client";

import React, { memo, useState } from "react";
import { GitBranch, Github, Settings } from "lucide-react";
import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";
import {
  useUserRepoBranchesQuery,
  useUserReposQuery,
} from "@/queries/user-repo-queries";
import { getGHAppInstallUrl, getGHAppInstallationsUrl } from "@/lib/gh-app-url";
import { cn } from "@/lib/utils";

function RepoSelectorInner({
  selectedRepoFullName,
  onChange,
}: {
  selectedRepoFullName: string | null;
  onChange: (repoFullName: string | null) => void;
}) {
  const { data: repoData, isLoading: isLoadingRepos } = useUserReposQuery();
  const repos = repoData?.repos;
  const repoError = repoData?.error;
  const repoItems = React.useMemo(() => {
    const items = [];
    if (repos) {
      items.push(
        ...repos.map((repo) => ({
          value: repo.full_name,
          label: repo.full_name,
        })),
      );
    } else if (selectedRepoFullName) {
      items.push({
        value: selectedRepoFullName,
        label: selectedRepoFullName,
      });
    }
    return items;
  }, [selectedRepoFullName, repos]);

  const repoByFullName = React.useMemo(() => {
    return Object.fromEntries(
      repos?.map((repo) => [repo.full_name, repo]) ?? [],
    );
  }, [repos]);

  const displayRepoFullName = isLoadingRepos
    ? (selectedRepoFullName ?? null)
    : repoByFullName[selectedRepoFullName ?? ""]
      ? selectedRepoFullName
      : null;

  return (
    <div className="space-y-2">
      {repoError && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {repoError === "bad_credentials"
            ? "GitHub connection expired. "
            : "No GitHub account linked. "}
          <a href="/sign-out" className="underline">
            Sign out and sign back in
          </a>{" "}
          to reconnect.
        </p>
      )}
      <ResponsiveCombobox
        items={repoItems}
        actionItems={[
          {
            value: "manage-github-apps",
            label: "Install or add repositories",
            icon: <Settings className="size-4 shrink-0" />,
            action: () => {
              window.open(getGHAppInstallUrl(), "_blank");
            },
          },
          {
            value: "configure-installations",
            label: "Configure GitHub App (add repos)",
            icon: <Github className="size-4 shrink-0" />,
            action: () => {
              window.open(getGHAppInstallationsUrl(), "_blank");
            },
          },
        ]}
        value={displayRepoFullName ?? null}
        setValue={(newRepoFullName) => {
          if (isLoadingRepos) {
            return;
          }
          onChange(newRepoFullName);
        }}
        placeholder="Select a Repo"
        searchPlaceholder="Search repositories"
        emptyText={(didSearch) => {
          if (repoError === "bad_credentials") {
            return "GitHub connection expired. Sign out and sign back in.";
          }
          if (repoError === "no_github_account") {
            return "No GitHub account linked. Sign out and sign back in.";
          }
          if (!didSearch) {
            return "Add a repo to get started.";
          }
          return "No repositories found.";
        }}
        isLoading={isLoadingRepos}
        loadingText="Loading repositories..."
        disabled={false}
        variant="outline"
      />
    </div>
  );
}

function RepoBranchSelectorInner({
  hideRepoSelector,
  repoSelectorClassName,
  branchSelectorClassName,
  selectedRepoFullName,
  selectedBranch,
  onChange,
}: {
  hideRepoSelector?: boolean;
  repoSelectorClassName?: string;
  branchSelectorClassName?: string;
  selectedRepoFullName: string | null;
  selectedBranch: string | null;
  onChange: (
    repoFullName: string | null,
    branch: string | null,
    isDefaultBranch?: boolean,
  ) => void;
}) {
  const { data: repoData, isLoading: isLoadingRepos } = useUserReposQuery();
  const repos = repoData?.repos;
  const repoError = repoData?.error;

  const [loadBranches, setLoadBranches] = useState(false);
  const { data: branches, isLoading: isLoadingBranches } =
    useUserRepoBranchesQuery(selectedRepoFullName, {
      enabled: loadBranches,
    });

  const repoItems = React.useMemo(() => {
    const items = [];

    if (repos) {
      items.push(
        ...repos.map((repo) => ({
          value: repo.full_name,
          label: repo.full_name,
        })),
      );
    } else if (selectedRepoFullName) {
      items.push({
        value: selectedRepoFullName,
        label: selectedRepoFullName,
      });
    }
    return items;
  }, [selectedRepoFullName, repos]);

  const repoByFullName = React.useMemo(() => {
    return Object.fromEntries(
      repos?.map((repo) => [repo.full_name, repo]) ?? [],
    );
  }, [repos]);

  const displayRepoFullName = isLoadingRepos
    ? (selectedRepoFullName ?? null)
    : repoByFullName[selectedRepoFullName ?? ""]
      ? selectedRepoFullName
      : null;
  const displaySelectedBranch =
    isLoadingBranches || !loadBranches
      ? (selectedBranch ?? null)
      : branches?.find((branch) => branch.name === selectedBranch)
        ? selectedBranch
        : null;
  return (
    <div className="flex flex-col gap-2 min-w-0">
      {repoError && (
        <p className="text-sm text-amber-600 dark:text-amber-400 px-2 sm:px-4">
          {repoError === "bad_credentials"
            ? "GitHub connection expired. "
            : "No GitHub account linked. "}
          <a href="/sign-out" className="underline">
            Sign out and sign back in
          </a>{" "}
          to reconnect.
        </p>
      )}
      <div className="flex flex-row items-center gap-2 sm:gap-4 px-2 sm:px-4 min-w-0">
        {!hideRepoSelector && (
          <ResponsiveCombobox
            icon={<Github className="size-4 shrink-0 hidden sm:block" />}
            items={repoItems}
            actionItems={[
              {
                value: "manage-github-apps",
                label: "Install or add repositories",
                icon: <Settings className="size-4 shrink-0" />,
                action: () => {
                  window.open(getGHAppInstallUrl(), "_blank");
                },
              },
              {
                value: "configure-installations",
                label: "Configure GitHub App (add repos)",
                icon: <Github className="size-4 shrink-0" />,
                action: () => {
                  window.open(getGHAppInstallationsUrl(), "_blank");
                },
              },
            ]}
            value={displayRepoFullName ?? null}
            setValue={(newRepoFullName) => {
              if (isLoadingRepos) {
                return;
              }
              if (newRepoFullName === null) {
                onChange(null, null);
                setLoadBranches(false);
              } else {
                const repo = repoByFullName?.[newRepoFullName];
                const newBranch = repo?.default_branch ?? "main";
                setLoadBranches(false);
                onChange(
                  newRepoFullName,
                  newBranch,
                  repo?.default_branch === newBranch,
                );
              }
            }}
            placeholder="Select a Repo"
            searchPlaceholder="Search repositories"
            emptyText={(didSearch) => {
              if (repoError === "bad_credentials") {
                return "GitHub connection expired. Sign out and sign back in.";
              }
              if (repoError === "no_github_account") {
                return "No GitHub account linked. Sign out and sign back in.";
              }
              if (!didSearch) {
                return "Add a repo to get started.";
              }
              return "No repositories found.";
            }}
            isLoading={isLoadingRepos}
            loadingText="Loading repositories..."
            disabled={false}
            className={cn(repoSelectorClassName, "shrink-1")}
          />
        )}
        <ResponsiveCombobox
          icon={<GitBranch className="size-4 shrink-0 hidden sm:block" />}
          className={cn(branchSelectorClassName, "shrink-1 min-w-[50px]")}
          key={selectedRepoFullName ?? "no-repo"}
          onLoadItems={() => {
            setLoadBranches(true);
          }}
          items={
            branches?.map((branch) => ({
              value: branch.name,
              label: branch.name,
            })) ??
            (selectedBranch
              ? [
                  {
                    value: selectedBranch,
                    label: selectedBranch,
                  },
                ]
              : [])
          }
          value={displaySelectedBranch ?? null}
          setValue={(newBranch) => {
            onChange(selectedRepoFullName, newBranch);
          }}
          placeholder="Select a Branch"
          searchPlaceholder="Search branches"
          emptyText="No branches found"
          isLoading={isLoadingBranches}
          disabled={selectedRepoFullName === null}
        />
      </div>
    </div>
  );
}

export const RepoBranchSelector = memo(RepoBranchSelectorInner);
export const RepoSelector = memo(RepoSelectorInner);
