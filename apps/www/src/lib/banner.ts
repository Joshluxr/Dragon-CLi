export const BANNER_KEY = "top-banner:config";

export type BannerConfig = {
  message: string;
  variant: "default" | "warning" | "error";
  enabled: boolean;
};
