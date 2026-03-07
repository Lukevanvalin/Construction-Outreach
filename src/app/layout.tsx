import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Construction Outreach CRM",
  description: "Track and manage construction contractor prospects",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-64 bg-navy-900 text-white flex flex-col flex-shrink-0">
            <div className="p-6 border-b border-navy-700">
              <Link href="/" className="block">
                <h1 className="text-xl font-bold tracking-tight">
                  <span className="text-warm-400">Construction</span>
                  <br />
                  Outreach CRM
                </h1>
              </Link>
              <p className="text-navy-300 text-xs mt-1">Contractor Prospect Tracker</p>
            </div>

            <nav className="flex-1 p-4">
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-navy-200 hover:text-white hover:bg-navy-800 text-sm font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Dashboard
                  </Link>
                </li>
              </ul>
            </nav>

            <div className="p-4 border-t border-navy-700">
              <div className="px-3 py-2 text-xs text-navy-400">
                Ruh AI Construction CRM
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
