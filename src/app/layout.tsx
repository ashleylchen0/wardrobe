import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Wardrobe",
  description: "Personal wardrobe and cost-per-wear tracker",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const signedIn = await getSession();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        {signedIn && (
          <header className="border-b border-stone-200 dark:border-stone-800">
            <nav className="mx-auto flex max-w-7xl items-center gap-5 px-5 py-3 text-sm">
              <a href="/" className="font-semibold">
                Wardrobe
              </a>
              <a href="/" className="text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">
                Closet
              </a>
              <SignOutButton />
            </nav>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
