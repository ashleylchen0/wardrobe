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
          ? "microcap text-ink border-ink border-b pb-0.5 text-[10px] font-bold"
          : "microcap text-muted hover:text-ink border-b border-transparent pb-0.5 text-[10px] transition-colors"
      }
    >
      {children}
    </Link>
  );
}
