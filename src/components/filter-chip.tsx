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
