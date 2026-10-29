import { Suspense } from "react";
import { AdminPage } from "@/features/store/admin-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <AdminPage section="payments" id={id} />
    </Suspense>
  );
}
