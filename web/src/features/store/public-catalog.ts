import { cache } from "react";
import type { Product } from "./types";

export type CatalogPage = {
  products: Product[];
  categories: string[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

async function read(path: string) {
  return fetch(new URL(path, process.env.API_INTERNAL_ORIGIN || "http://127.0.0.1:3000"), {
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(4000),
  });
}

export async function readCatalog(query = "", allowInvalidQuery = false): Promise<CatalogPage | null> {
  const result = await read("/api/products?" + query);
  if (allowInvalidQuery && result.status === 400) return null;
  if (!result.ok) throw new Error("Catalog service unavailable");
  return result.json();
}

export const readProduct = cache(async (id: string): Promise<Product | null> => {
  const result = await read("/api/products/" + encodeURIComponent(id));
  if (result.status === 404) return null;
  if (!result.ok) throw new Error("Product service unavailable");
  return (await result.json()).product;
});
