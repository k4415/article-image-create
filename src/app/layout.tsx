import type { Metadata } from "next";
import Link from "next/link";
import { Database, ImagePlus, UploadCloud } from "lucide-react";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "記事LP素材DB",
  description: "記事LP内の画像・動画素材を検索、確認、追加する管理UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Database size={18} />
              記事LP素材DB
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                素材一覧
              </Link>
              <Link
                href="/editor"
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <ImagePlus size={16} />
                画像生成
              </Link>
              <Link
                href="/ingest"
                className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                <UploadCloud size={16} />
                URL追加
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
