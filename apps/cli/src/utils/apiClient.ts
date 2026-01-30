import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import {
  ContractRouterClient,
  InferContractRouterOutputs,
} from "@orpc/contract";
import { getApiKey } from "./config";
import { cliAPIContract } from "@terragon/cli-api-contract";

const link = new RPCLink({
  url: `${process.env.TERRAGON_WEB_URL}/api/cli`,
  headers: async () => ({
    "X-Daemon-Token": (await getApiKey()) ?? "",
  }),
});

export const apiClient: ContractRouterClient<typeof cliAPIContract> =
  createORPCClient(link);

export type Outputs = InferContractRouterOutputs<typeof cliAPIContract>;
