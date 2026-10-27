import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../style.css";

export const metadata: Metadata = {
  title: "MIPA Store | Campus creative goods",
  description: "Thoughtful creations from our campus community, made to last.",
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
