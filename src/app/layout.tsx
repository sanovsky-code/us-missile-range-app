import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import { CurrentUserProvider } from "@/lib/current-user";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "מפת אתרי ניסוי וביטחון - ארה\"ב",
  description: "מפה אינטראקטיבית של אתרי טילים, שיגור, מכ\"מ, מטווחי ניסוי והגנה אווירית בארה\"ב",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col">
        <CurrentUserProvider>
          <Navbar />
          <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
        </CurrentUserProvider>
      </body>
    </html>
  );
}
