import { categoryEmoji } from "@/lib/format";
import type { Category } from "@/lib/categories";

/**
 * The item's photo when there is one, and the category's emoji when there
 * isn't.
 *
 * The previous stand-in was tinted per category, which made the grid the most
 * colorful surface in a monochrome app. Greyscale emoji at low opacity keep
 * categories scannable without reintroducing a palette.
 *
 * Photos live in a private blob store, so they come through the /api/photo
 * proxy rather than being addressed directly.
 */
export function ItemPhoto({
  name,
  imagePath,
  category,
  className = "",
  emojiClassName = "text-4xl",
  eager = false,
}: {
  name: string;
  imagePath: string | null;
  category: Category;
  className?: string;
  emojiClassName?: string;
  eager?: boolean;
}) {
  return (
    <div className={`bg-tile relative overflow-hidden ${className}`}>
      {imagePath ? (
        // eslint-disable-next-line @next/next/no-img-element -- private blob, proxied
        <img
          src={`/api/photo/${imagePath}`}
          alt={name}
          loading={eager ? "eager" : "lazy"}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`absolute inset-0 grid place-items-center grayscale opacity-35 ${emojiClassName}`}
        >
          {categoryEmoji(category)}
        </span>
      )}
    </div>
  );
}
