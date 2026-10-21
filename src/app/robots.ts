import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/siteUrl.ts";

/**
 * 巡回自体は許可する(noindex の指定は、ページを読んでもらわないと検索エンジンに伝わらないため)。
 * 検索結果に出すかどうかは各ページの robots メタタグで制御している(既定は noindex)。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
