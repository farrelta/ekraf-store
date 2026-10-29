import { Suspense } from "react";
import { CartPage } from "@/features/store/store-pages";
export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <CartPage />
    </Suspense>
  );
}
