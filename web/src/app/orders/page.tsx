import { Suspense } from "react";
import { OrdersPage } from "@/features/store/store-pages";
export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <OrdersPage />
    </Suspense>
  );
}
