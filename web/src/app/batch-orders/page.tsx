import { Suspense } from "react";
import { ShopPage } from "@/features/store/store-pages";
export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <ShopPage batchOnly />
    </Suspense>
  );
}
