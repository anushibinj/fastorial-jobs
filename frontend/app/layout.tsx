import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/app/footer";
import { Header } from "@/components/app/header";
import { RegisterServiceWorker } from "@/components/app/register-sw";
import { Toaster } from "@/components/ui/sonner";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "Curated software engineering jobs, filtered by location, experience and tech stack.",
  applicationName: SITE_NAME,
  appleWebApp: { capable: true, title: "Fastorial Jobs", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: { siteName: SITE_NAME, type: "website", locale: "en_IN" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <Header />
        <div className="pl-safe pr-safe flex flex-1 flex-col">{children}</div>
        <Footer />
        <Toaster position="top-center" />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
