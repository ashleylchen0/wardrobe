import Link from "next/link";

/**
 * A filter is a word with a count, underlined when it is the one in force.
 * No pill, no fill — in the Archive the type carries the state.
 *
 * Status ("Archived") rides in the same row rather than in a separate tab
 * strip: it filters the same grid on the same axis as far as the reader is
 * concerned, and a second row of controls above the first was the heaviest
 * thing on the page.
 */
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
      className={`microcap whitespace-nowrap pb-0.5 text-[10px] capitalize ${
        active
          ? "border-ink border-b font-bold"
          : "text-muted hover:text-ink transition-colors"
      }`}
    >
      {children}
    </Link>
  );
}
