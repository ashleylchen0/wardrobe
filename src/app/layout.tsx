import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSession } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { SignOutButton } from "./sign-out";

/**
 * No `next/font` here on purpose: the Archive is set in Helvetica Neue, a
 * system face on every machine this runs on. Loading a webfont to render it
 * would be a network round trip for a font already installed.
 */

export const metadata: Metadata = {
  title: "Wardrobe",
  description: "Personal wardrobe and cost-per-wear tracker",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const signedIn = await getSession();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* A rule in ink, not a masthead: the header is one line tall so the
            clothes start as close to the top of the page as possible. */}
        {signedIn && (
          <header className="border-ink border-b">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-x-7 gap-y-2 px-4 py-3 sm:px-6">
              <Link href="/" className="microcap text-[12px] font-bold">
                Wardrobe
              </Link>
              <nav className="flex items-baseline gap-6">
                <NavLink href="/">Closet</NavLink>
                <NavLink href="/log">Today</NavLink>
                <NavLink href="/calendar">Calendar</NavLink>
                <NavLink href="/stats">Stats</NavLink>
                <SignOutButton />
              </nav>
            </div>
          </header>
        )}
        {children}
        {signedIn && (
          <footer className="border-hair mt-auto border-t">
            <div className="microcap text-muted mx-auto w-full max-w-6xl px-4 py-3 text-[9px] sm:px-6">
              Tracked since May 2023 · cost per wear = cost ÷ times worn
            </div>
          </footer>
        )}
      </body>
    </html>
  );
}
