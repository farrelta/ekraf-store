"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import type { Product } from "./types";
export const productImageSources = (product: Product) => product.imageKeys?.length ? product.imageKeys : product.imageKey ? [product.imageKey] : [];
export function ProductImage({ product, loading = "lazy", source, number }: { product: Product; loading?: "eager" | "lazy"; source?: string; number?: number }) {
  const src = source || productImageSources(product)[0];
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return src && failedSource !== src ? <img src={src} loading={loading} decoding="async" alt={number ? `${product.name}, photo ${number}` : product.name} onError={() => setFailedSource(src)} referrerPolicy="no-referrer"/> : <div className="image-placeholder"><Icon name="box" size={36}/><span>{product.name}</span></div>;
}
function GalleryChevron({ next = false }: { next?: boolean }) {
  const path = next ? "m9 4 8 8-8 8" : "m15 4-8 8 8 8";
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={path} stroke="var(--surface)" strokeWidth="2.5"/><path d={path} stroke="currentColor" strokeWidth="1"/></svg>;
}
export function ProductGallery({ product, eager = false }: { product: Product; eager?: boolean }) {
  const images = productImageSources(product);
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null), activeRef = useRef(0);
  const version = JSON.stringify(images);
  useEffect(() => {
    activeRef.current = 0; setActive(0);
    const node = track.current;
    if (!node) return;
    node.scrollLeft = 0;
    const resize = new ResizeObserver(() => { node.scrollLeft = activeRef.current * node.clientWidth; });
    resize.observe(node);
    return () => resize.disconnect();
  }, [version]);
  const go = (index: number) => {
    const node = track.current;
    if (!node) return;
    node.scrollTo({ left: Math.max(0, Math.min(images.length - 1, index)) * node.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const sources = images.length ? images : [undefined];
  return <div className="product-gallery" role="region" aria-label={`Photos of ${product.name}`} aria-roledescription={images.length > 1 ? "carousel" : undefined}>
    <div className="detail-photo gallery-main">
    <div className="gallery-track" ref={track} tabIndex={images.length > 1 ? 0 : undefined} aria-label={images.length > 1 ? "Swipe or use arrow keys to browse photos" : undefined} onScroll={event => {
      const node = event.currentTarget;
      const index = Math.max(0, Math.min(sources.length - 1, Math.round(node.scrollLeft / Math.max(1, node.clientWidth))));
      activeRef.current = index; setActive(index);
    }} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? active + 1 : event.key === "ArrowLeft" ? active - 1 : event.key === "Home" ? 0 : event.key === "End" ? images.length - 1 : null;
      if (next !== null && images.length > 1) { event.preventDefault(); go(next); }
    }}>
      {sources.map((source, index) => {
        const image = <ProductImage product={product} source={source} number={images.length > 1 ? index + 1 : undefined} loading={eager && index === 0 ? "eager" : "lazy"}/>;
        return <div className="gallery-slide" key={source || "empty"} role="group" aria-label={`Photo ${index + 1} of ${sources.length}`}>{image}</div>;
      })}
    </div>
    {images.length > 1 && <>
      <button className="gallery-previous" type="button" aria-label={`Previous photo of ${product.name}`} disabled={active === 0} onClick={() => go(active - 1)}><GalleryChevron/></button>
      <button className="gallery-next" type="button" aria-label={`Next photo of ${product.name}`} disabled={active === images.length - 1} onClick={() => go(active + 1)}><GalleryChevron next/></button>
      <span className="gallery-count" aria-live="polite" aria-atomic="true">{active + 1} / {images.length}</span>
    </>}
    </div>
    {images.length > 0 && <div className="gallery-thumbnails" role="group" aria-label={`Available photos of ${product.name}`}>
      {images.map((source, index) => <button className="gallery-thumbnail" key={source} type="button" aria-label={`Show photo ${index + 1} of ${product.name}`} aria-pressed={active === index} onClick={() => go(index)}><ProductImage product={product} source={source} number={index + 1}/></button>)}
    </div>}
  </div>;
}
