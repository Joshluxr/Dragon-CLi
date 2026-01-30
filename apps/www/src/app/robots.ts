import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/internal/", "/admin/"],
    },
    sitemap: "https://www.terragonlabs.com/sitemap.xml",
  };
}
