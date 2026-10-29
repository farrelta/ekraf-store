import { Suspense } from "react";
import { OrdersPage } from "@/features/store/store-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <OrdersPage id={id} />
    </Suspense>
  );
}
