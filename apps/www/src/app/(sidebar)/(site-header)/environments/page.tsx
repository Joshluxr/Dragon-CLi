import { Environments } from "@/components/environments/main";
import { getUserIdOrRedirect } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { getEnvironments } from "@terragon/shared/model/environments";
import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Environments | Terragon",
};

export default async function EnvironmentsPage() {
  const userId = await getUserIdOrRedirect();
  const environments = await getEnvironments({
    db,
    userId,
    includeGlobal: false,
  });
  return <Environments environments={environments} />;
}
