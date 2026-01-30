import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/internal/", "/admin/"],
    },
    sitemap: "https://dragon-labz.vercel.app/sitemap.xml",
  };
}
