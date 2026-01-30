import { AIModel } from "@terragon/agent/types";
import { getUserFlags } from "@terragon/shared/model/user-flags";
import { getUserCredentials } from "./user-credentials";
import { getDefaultModel as getDefaultModelLib } from "@/lib/default-ai-model";
import { db } from "@/lib/db";

export async function getDefaultModel({
  userId,
}: {
  userId: string;
}): Promise<AIModel> {
  const [userFlags, userCredentials] = await Promise.all([
    getUserFlags({ db, userId }),
    getUserCredentials({ userId }),
  ]);
  return getDefaultModelLib({ userCredentials, userFlags });
}
