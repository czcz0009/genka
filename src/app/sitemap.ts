import type { MetadataRoute } from "next";
import { APP_URL, PUBLIC_PATHS } from "@/lib/siteUrl.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${APP_URL}${path}` }));
}
