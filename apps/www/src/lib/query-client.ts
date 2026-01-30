import { QueryClient } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined = undefined;
const isServer = typeof window === "undefined";

export function getOrCreateQueryClient(): QueryClient {
  let queryClient: QueryClient | undefined = undefined;
  if (isServer || !browserQueryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
        },
      },
    });
  }
  if (!isServer && !browserQueryClient) {
    browserQueryClient = queryClient;
  }
  if (isServer) {
    return queryClient!;
  }
  return browserQueryClient!;
}
