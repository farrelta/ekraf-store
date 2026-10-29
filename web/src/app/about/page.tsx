import { Suspense } from "react";
import { AboutPage } from "@/features/store/store-pages";
export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <AboutPage />
    </Suspense>
  );
}
