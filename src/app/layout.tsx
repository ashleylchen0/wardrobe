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
        {signedIn && (
          <header className="border-hair border-b">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-baseline gap-x-7 gap-y-3 px-6 py-6">
              <Link href="/" className="font-serif text-2xl tracking-tight">
                Wardrobe
              </Link>
              <nav className="flex items-baseline gap-7">
                <NavLink href="/">Closet</NavLink>
                <NavLink href="/log">Today</NavLink>
                <NavLink href="/calendar">Calendar</NavLink>
                {/* Routes that don't exist yet read as text, not links that 404. */}
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
