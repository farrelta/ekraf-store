import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AdminConsole from "@/features/store/admin-console";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "EKRAF Administration",
  robots: { index: false, follow: false },
};
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ adminPath: string }>;
}) {
  const { adminPath } = await params;
  const configured = process.env.ADMIN_PANEL_PATH;
  if (
    !configured ||
    !/^[-a-zA-Z0-9_]{16,100}$/.test(configured) ||
    adminPath !== configured
  )
    notFound();
  return <AdminConsole>{children}</AdminConsole>;
}
