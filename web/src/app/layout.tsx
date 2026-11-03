import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../style.css";
import { StoreProvider } from "@/features/store/store-provider";

export const metadata: Metadata = {
  title: "EKRAF | BEM KM MIPA UGM",
  description: "Merchandise and faculty batch pieces from EKRAF BEM KM MIPA UGM.",
};

export const viewport: Viewport = {
  themeColor: "#00552e",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
