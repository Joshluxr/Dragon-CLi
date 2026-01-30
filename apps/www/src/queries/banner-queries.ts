import { getBannerConfigAction } from "@/server-actions/unauthed/banner-actions";

export const BANNER_QUERY_KEY = ["banner-config"] as const;

export function bannerQueryOptions() {
  return {
    queryKey: BANNER_QUERY_KEY,
    queryFn: async () => {
      return await getBannerConfigAction();
    },
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  };
}
