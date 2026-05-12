import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/api/", "/admin/", "/owner/", "/staff/", "/agent/", "/super-admin/"],
    },
    sitemap: "https://sellflickpos.com/sitemap.xml",
    host: "https://sellflickpos.com",
  };
}
