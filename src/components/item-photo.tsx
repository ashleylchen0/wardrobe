import { Garment } from "@/components/garment";
import type { Category } from "@/lib/categories";

/**
 * The item's photo when there is one, and category artwork when there isn't.
 *
 * Photos live in a private blob store, so they come through the /api/photo
 * proxy rather than being addressed directly.
 */
export function ItemPhoto({
  name,
  imagePath,
  category,
  className = "",
  garmentClassName = "h-[78%] w-[58%]",
  eager = false,
}: {
  name: string;
  imagePath: string | null;
  category: Category;
  className?: string;
  garmentClassName?: string;
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
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <Garment category={category} className={garmentClassName} />
        </div>
      )}
    </div>
  );
}
