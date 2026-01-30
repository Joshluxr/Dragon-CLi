"use client";

import { useAtom } from "jotai";
import { selectedRepoAtom, selectedBranchAtom } from "@/atoms/user-flags";

export function useSelectedRepo() {
  const [selectedRepo, setSelectedRepo] = useAtom(selectedRepoAtom);
  return [selectedRepo, setSelectedRepo] as const;
}

export function useSelectedBranch(): [
  string | null,
  (branch: string | null) => void,
] {
  const [selectedBranch, setSelectedBranch] = useAtom(selectedBranchAtom);
  return [selectedBranch, setSelectedBranch];
}
