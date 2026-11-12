import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toast";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Vabani Bricks", template: "%s · Vabani Bricks" },
  description: "Brick manufacturing & supply - inventory, billing, credit and payments",
  manifest: "/manifest.webmanifest",
  applicationName: "Vabani Bricks",
  appleWebApp: { capable: true, title: "Vabani Bricks", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/pwa-icon/180" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#A63D2F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen font-sans">
        {children}
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
