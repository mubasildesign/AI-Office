import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "AI Office Studio",
  description: "Design, run, and deploy a portable company of collaborating AI agents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${GeistMono.variable}`}>
        <a className="skip-link" href="#main">Skip to content</a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
