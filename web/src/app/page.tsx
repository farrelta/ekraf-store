import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopPage } from "@/features/store/store-pages";
import { readCatalog } from "@/features/store/public-catalog";
import { publicMetadata } from "@/features/store/seo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const description = "Shop EKRAF BEM KM MIPA UGM campus merchandise and batch orders, with pickup at UGM in Yogyakarta.";

function catalogView(params: Awaited<Props["searchParams"]>) {
  const number = typeof params.page === "string" && /^[1-9]\d{0,8}$/.test(params.page) ? Number(params.page) : 1;
  const clean = Object.keys(params).every(key => key === "page") &&
    (params.page === undefined || params.page === String(number));
  return { number, clean, path: clean && number > 1 ? "/?page=" + number : "/" };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { clean, number, path } = catalogView(await searchParams);
  const title = "EKRAF Store | MIPA UGM Merchandise and Batch Orders";
  return {
    ...publicMetadata(clean && number > 1 ? title + " – Page " + number : title, description, path),
    ...(!clean ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  const { number, clean } = catalogView(params);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (value) value.forEach(item => query.append(key, item));
  }
  const data = await readCatalog(query.toString(), !clean);
  if (clean && number > 1 && number > (data?.pagination.pageCount ?? 0)) notFound();
  return <ShopPage key={query.toString()} initialCatalog={data} />;
}
