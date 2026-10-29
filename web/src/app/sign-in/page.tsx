import { Suspense } from "react";
import { AuthPage } from "@/features/store/store-pages";
export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <AuthPage />
    </Suspense>
  );
}
