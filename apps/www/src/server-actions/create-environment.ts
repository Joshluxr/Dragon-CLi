"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { getOrCreateEnvironment } from "@terragon/shared/model/environments";

export const createEnvironment = userOnlyAction(
  async function createEnvironment(
    userId: string,
    { repoFullName }: { repoFullName: string },
  ) {
    const environment = await getOrCreateEnvironment({
      db,
      userId,
      repoFullName,
    });
    return environment;
  },
  { defaultErrorMessage: "Failed to create environment" },
);
