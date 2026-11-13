import { Suspense } from "react";
import { AboutPage } from "@/features/store/store-pages";
import { publicMetadata } from "@/features/store/seo";

export const metadata = publicMetadata("About EKRAF | BEM KM MIPA UGM",
  "Meet EKRAF, the student creative economy team behind UGM campus merchandise and batch orders in Yogyakarta.", "/about");

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <AboutPage />
    </Suspense>
  );
}
