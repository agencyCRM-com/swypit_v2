import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Swypit Agency CRM Provider",
  description: "Agency CRM custom payment provider powered by Tilled.",
};

const shellStyle = {
  minHeight: "100vh",
  margin: 0,
  background: "#f4f7fb",
  color: "#111827",
  fontFamily: "Arial, Helvetica, sans-serif",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={shellStyle}>{children}</body>
    </html>
  );
}
