import { notFound } from "next/navigation";
import { ProductPage } from "@/features/store/store-pages";
import { readProduct } from "@/features/store/public-catalog";
import { productDescription, productStructuredData } from "@/features/store/product-seo";
import { privateMetadata, productPath, publicMetadata } from "@/features/store/seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const product = await readProduct((await params).id);
  if (!product) return privateMetadata;
  return publicMetadata(product.name + " | EKRAF Store", productDescription(product),
    productPath(product.id), product.imageKeys?.[0] || product.imageKey || undefined);
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const product = await readProduct(id);
  if (!product) notFound();
  const json = JSON.stringify(productStructuredData(product)).replace(/</g, "\\u003c");
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
    <ProductPage key={id} id={id} initialProduct={product} />
  </>;
}
