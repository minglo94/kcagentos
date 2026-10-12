import type { Metadata } from "next";
import localFont from "next/font/local";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

// Use bundled fonts so local startup/build does not contact Google Fonts.
const notoSansTC = localFont({ src: [
  { path: "../../public/fonts/NotoSansTC-Regular.otf", weight: "400" },
  { path: "../../public/fonts/NotoSansTC-Bold.otf", weight: "700" },
], variable: "--font-sans-tc", display: "swap" });
const sans = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-dm-sans", display: "swap" });
const mono = localFont({ src: "./fonts/GeistMonoVF.woff", variable: "--font-dm-mono", display: "swap" });

export const metadata: Metadata = {
  title: "基智 Agent OS",
  description: "基智中學 · 教師智能工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK" className={`${notoSansTC.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
