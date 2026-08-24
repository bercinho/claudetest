import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family HQ",
  description: "Tasks, rewards, house rules and pocket money — agreed once, tracked together.",
  applicationName: "Family HQ",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Family HQ", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#191a20" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // Lets the layout paint into the notch and gesture areas when installed.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
