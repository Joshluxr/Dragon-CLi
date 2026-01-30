export type FeatureUpsellContent = {
  title: string;
  imageUrl?: string;
  lines: string[];
  ctaUrl?: string;
  ctaText?: string;
};

// Configure the current upsell content here. Bump
// FEATURE_UPSELL_VERSION in constants.ts to re-show.
export const CURRENT_FEATURE_UPSELL: FeatureUpsellContent | null = null;
