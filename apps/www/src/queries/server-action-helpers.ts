import {
  QueryKey,
  useMutation,
  useQuery,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";
import {
  ServerActionResult,
  unwrapError,
  unwrapResult,
} from "@/lib/server-actions";
import { toast } from "sonner";

export function useServerActionMutation<
  TVariables = void,
  TData = void,
  TContext = unknown,
>({
  mutationFn,
  ...mutationOptions
}: {
  mutationFn: (variables: TVariables) => Promise<ServerActionResult<TData>>;
} & Omit<
  UseMutationOptions<TData, unknown, TVariables, TContext>,
  "mutationFn"
>) {
  return useMutation({
    mutationFn: async (variables: TVariables) => {
      return unwrapResult(await mutationFn(variables));
    },
    ...mutationOptions,
    onError: (error, variables, context) => {
      toast.error(unwrapError(error));
      return mutationOptions?.onError?.(error, variables, context);
    },
  });
}

export function getServerActionQueryOptions<TData>({
  queryKey,
  queryFn,
  ...queryOptions
}: {
  queryKey: QueryKey;
  queryFn: () => Promise<ServerActionResult<TData>>;
} & Omit<UseQueryOptions<TData>, "queryKey" | "queryFn">) {
  return {
    queryKey,
    queryFn: async () => {
      return unwrapResult(await queryFn());
    },
    ...queryOptions,
  };
}

export function useServerActionQuery<TData>({
  queryKey,
  queryFn,
  ...queryOptions
}: {
  queryKey: QueryKey;
  queryFn: () => Promise<ServerActionResult<TData>>;
} & Omit<UseQueryOptions<TData>, "queryKey" | "queryFn">) {
  return useQuery(
    getServerActionQueryOptions({ queryKey, queryFn, ...queryOptions }),
  );
}
