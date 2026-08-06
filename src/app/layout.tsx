import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "./sign-out";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Editorial serif for garment names and headings; Geist carries the data. */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Wardrobe",
  description: "Personal wardrobe and cost-per-wear tracker",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const signedIn = await getSession();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {signedIn && (
          <header className="border-hair border-b">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-baseline gap-x-7 gap-y-3 px-6 py-6">
              <Link href="/" className="font-serif text-2xl tracking-tight">
                Wardrobe
              </Link>
              <nav className="flex items-baseline gap-7">
                <Link
                  href="/"
                  className="eyebrow text-ink border-ink border-b pb-0.5"
                >
                  Closet
                </Link>
                {/* Routes that don't exist yet read as text, not links that 404. */}
                <span className="eyebrow opacity-45" title="Not built yet">
                  Today
                </span>
                <span className="eyebrow opacity-45" title="Not built yet">
                  Stats
                </span>
              </nav>
              <SignOutButton />
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
