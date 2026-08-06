import Link from "next/link";

export function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
        active
          ? "border-sage bg-sage font-medium text-white"
          : "border-hair text-muted hover:border-sage hover:text-sage"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * Status is a coarser cut than category, so it reads as a tab rather than
 * another chip in the same row — otherwise "Archived" looks like a garment type.
 */
export function StatusTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b px-1 pb-2.5 text-sm transition-colors ${
        active
          ? "border-ink text-ink"
          : "text-muted hover:text-ink border-transparent"
      }`}
    >
      {children}
    </Link>
  );
}
