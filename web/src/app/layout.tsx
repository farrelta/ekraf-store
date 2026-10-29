import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../style.css";

export const metadata: Metadata = {
  title: "EKRAF | BEM MIPA UGM",
  description: "Merchandise and faculty batch pieces from EKRAF BEM MIPA UGM.",
};

export const viewport: Viewport = {
  themeColor: "#143a32",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
