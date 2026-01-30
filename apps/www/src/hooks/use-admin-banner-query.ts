import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRawBannerConfigAction } from "@/server-actions/admin/banner";
import { BannerConfig } from "@/lib/banner";
import {
  updateBannerConfigAction,
  deleteBannerConfigAction,
} from "@/server-actions/admin/banner";

export const ADMIN_BANNER_QUERY_KEY = ["admin-banner-config"] as const;

export function useAdminBannerQuery() {
  return useQuery({
    queryKey: ADMIN_BANNER_QUERY_KEY,
    queryFn: async () => {
      return await getRawBannerConfigAction();
    },
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
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
      // Invalidate both admin and regular banner queries
      queryClient.invalidateQueries({ queryKey: ADMIN_BANNER_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["banner-config"] });
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
      // Invalidate both admin and regular banner queries
      queryClient.invalidateQueries({ queryKey: ADMIN_BANNER_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["banner-config"] });
    },
  });
}
