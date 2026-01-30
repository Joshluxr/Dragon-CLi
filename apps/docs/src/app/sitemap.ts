import { MetadataRoute } from "next";
import { source } from "@/lib/source";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://docs.terragonlabs.com";

  // Get all documentation pages
  const pages = source.getPages();

  // Generate sitemap entries for all documentation pages
  const docEntries = pages.map((page) => {
    const slug = page.slugs.join("/");
    const url = slug ? `${baseUrl}/docs/${slug}` : `${baseUrl}/docs`;

    return {
      url,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    };
  });

  // Add static pages
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
  ];

  return [...staticPages, ...docEntries];
}
