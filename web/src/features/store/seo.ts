import type { Metadata } from "next";
import { jacketPhoto } from "./design-assets";

export const siteOrigin = new URL(process.env.SITE_ORIGIN || "https://ekrafmipaugm.web.id").origin;
export const storeName = "EKRAF Store";
export const privateMetadata: Metadata = { robots: { index: false, follow: false } };
export const absoluteUrl = (path: string) => new URL(path, siteOrigin).href;
export const productPath = (id: string) => "/products/" + encodeURIComponent(id);

export function publicMetadata(title: string, description: string, path: string, image = jacketPhoto): Metadata {
  const url = absoluteUrl(path);
  const images = [{ url: absoluteUrl(image), alt: title }];
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { type: "website", title, description, url, siteName: storeName, images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
