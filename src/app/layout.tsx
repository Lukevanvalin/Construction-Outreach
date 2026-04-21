import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ruh AI · Construction CRM",
  description: "Account-centric lifecycle tracking for Ruh AI construction engagements",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex min-h-screen">
          <aside className="w-60 bg-navy-900 text-white flex flex-col flex-shrink-0">
            <div className="p-5 border-b border-navy-700">
              <Link href="/accounts" className="block">
                <h1 className="text-lg font-bold tracking-tight">
                  <span className="text-warm-400">Ruh AI</span>
                  <br />Construction CRM
                </h1>
              </Link>
              <p className="text-navy-300 text-xs mt-1">Account-centric lifecycle</p>
            </div>
            <nav className="flex-1 p-3">
              <ul className="space-y-1">
                <li>
                  <Link href="/accounts" className="flex items-center gap-2 px-3 py-2 rounded-lg text-navy-200 hover:text-white hover:bg-navy-800 text-sm font-medium">
                    Accounts
                  </Link>
                </li>
              </ul>
            </nav>
            <div className="p-4 border-t border-navy-700 text-xs text-navy-400">v2 — schema pivot</div>
          </aside>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
