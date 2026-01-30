import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BannerConfig } from "@/lib/banner";
import {
  updateBannerConfigAction,
  deleteBannerConfigAction,
} from "@/server-actions/admin/banner";
import { BANNER_QUERY_KEY, bannerQueryOptions } from "@/queries/banner-queries";

export function useBannerQuery() {
  return useQuery(bannerQueryOptions());
}

export function useUpdateBannerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: BannerConfig) => {
      const result = await updateBannerConfigAction(config);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BANNER_QUERY_KEY });
    },
  });
}

export function useDeleteBannerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await deleteBannerConfigAction();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BANNER_QUERY_KEY });
    },
  });
}
