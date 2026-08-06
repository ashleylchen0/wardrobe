"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={
        active
          ? "eyebrow text-ink border-ink border-b pb-0.5"
          : "eyebrow hover:text-ink border-b border-transparent pb-0.5 transition-colors"
      }
    >
      {children}
    </Link>
  );
}
