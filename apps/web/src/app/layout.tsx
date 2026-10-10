import type { ReactNode } from "react";
import type { Viewport } from "next";
import "@/styles/bloom.css";

export const metadata = {
  title: "LexiCore",
  description: "Personal Vietnamese-first language-learning app",
  appleWebApp: { capable: true, title: "LexiCore", statusBarStyle: "default" as const },
};

// viewport-fit=cover lets the layout extend under the iPhone notch/home
// indicator; bloom.css pads with env(safe-area-inset-*) accordingly.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF3EE" },
    { media: "(prefers-color-scheme: dark)", color: "#241923" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
