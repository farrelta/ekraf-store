import { Suspense } from "react";
import { AdminPage } from "@/features/store/admin-pages";
export default function Page() {
  return (
    <Suspense>
      <AdminPage section="settings" />
    </Suspense>
  );
}
