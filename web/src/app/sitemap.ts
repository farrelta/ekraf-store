import type { MetadataRoute } from "next";
import { readCatalog } from "@/features/store/public-catalog";
import { absoluteUrl, productPath } from "@/features/store/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [{ url: absoluteUrl("/") }, { url: absoluteUrl("/about") }];
  const seen = new Set<string>();
  for (let page = 1; urls.length < 50_000; page++) {
    const data = await readCatalog("pageSize=100&sort=name&page=" + page);
    if (!data) throw new Error("Catalog unavailable for sitemap");
    for (const product of data.products) {
      if (urls.length >= 50_000) break;
      if (product.status !== "PUBLISHED" || seen.has(product.id)) continue;
      seen.add(product.id);
      urls.push({ url: absoluteUrl(productPath(product.id)), lastModified: product.updatedAt });
    }
    if (page >= data.pagination.pageCount || !data.products.length) break;
  }
  return urls;
}
