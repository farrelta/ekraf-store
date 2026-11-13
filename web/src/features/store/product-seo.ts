import type { Product } from "./types";
import { openBatches } from "./batch-window";
import { absoluteUrl, productPath } from "./seo";

export function productDescription(product: Product) {
  const text = product.description.replace(/\s+/g, " ").trim();
  return text.length > 160 ? text.slice(0, 157).trimEnd() + "…" :
    text || product.name + " from EKRAF BEM KM MIPA UGM, with campus pickup in Yogyakarta.";
}

export function productStructuredData(product: Product) {
  const url = absoluteUrl(productPath(product.id));
  const images = (product.imageKeys?.length ? product.imageKeys : product.imageKey ? [product.imageKey] : []).map(absoluteUrl);
  const variants = product.variants.filter(v => v.active && Number.isFinite(Number(v.price)) && Number(v.price) > 0);
  const batchOpen = openBatches(product.batches).length > 0;
  const prices = variants.map(v => Number(v.price));
  const offers = variants.length === 1 ? {
    "@type": "Offer",
    url, priceCurrency: "IDR", price: prices[0],
    availability: "https://schema.org/" + (product.sellingType === "BATCH"
      ? batchOpen ? "PreOrder" : "OutOfStock"
      : variants[0].onHand > variants[0].reserved ? "InStock" : "OutOfStock"),
  } : variants.length > 1 ? {
    "@type": "AggregateOffer",
    url, priceCurrency: "IDR", lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: variants.length,
  } : undefined;
  return {
    "@context": "https://schema.org", "@type": "Product",
    name: product.name, description: product.description || productDescription(product), url,
    ...(images.length ? { image: images } : {}),
    ...(variants.length === 1 ? { sku: variants[0].sku } : {}),
    ...(offers ? { offers } : {}),
  };
}
