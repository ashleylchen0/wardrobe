import type { Category } from "@/lib/categories";

/**
 * Stand-in artwork for items with no photo yet. Shape and tint both come from
 * the item's category — nothing here invents data the catalog doesn't have,
 * and the color makes categories scannable down the grid.
 */

const TINTS: Record<Category, string> = {
  tops: "#c9c2b4",
  sweaters: "#c6b9a2",
  bottoms: "#8a8577",
  jeans: "#4a5f7e",
  dresses: "#7e8c7a",
  outerwear: "#b99b6e",
  shoes: "#3a3936",
  accessories: "#a8a08c",
};

const SEAM = "rgba(255,255,255,0.32)";

function Shape({ category }: { category: Category }) {
  switch (category) {
    case "outerwear":
      return (
        <>
          <path d="M34,12 L22,8 L2,46 L16,58 L26,40 L26,126 L74,126 L74,40 L84,58 L98,46 L78,8 L66,12 L50,28 Z" />
          <path d="M50,28 L50,126" stroke={SEAM} strokeWidth="2" fill="none" />
        </>
      );
    case "jeans":
      return (
        <>
          <path d="M28,8 L72,8 L74,34 L69,126 L55,126 L50,62 L45,126 L31,126 L26,34 Z" />
          <path d="M26.6,19 L73.4,19" stroke={SEAM} strokeWidth="2" fill="none" />
        </>
      );
    case "sweaters":
      return (
        <>
          <path d="M36,12 L26,8 L4,44 L18,54 L28,34 L28,116 L72,116 L72,34 L82,54 L96,44 L74,8 L64,12 C60,20 40,20 36,12 Z" />
          <path d="M28,108 L72,108" stroke={SEAM} strokeWidth="2" fill="none" />
        </>
      );
    case "bottoms":
      return (
        <>
          <path d="M32,10 L68,10 L84,104 L16,104 Z" />
          <g stroke={SEAM} strokeWidth="2" fill="none">
            <path d="M31,21 L69,21" />
            <path d="M42,22 L36,104" />
            <path d="M50,22 L50,104" />
            <path d="M58,22 L64,104" />
          </g>
        </>
      );
    case "dresses":
      return (
        <>
          <path d="M36,12 L26,8 L8,26 L18,40 L28,32 L27,58 L12,124 L88,124 L73,58 L72,32 L82,40 L92,26 L74,8 L64,12 C60,20 40,20 36,12 Z" />
          <path d="M27,58 L73,58" stroke={SEAM} strokeWidth="2" fill="none" />
        </>
      );
    case "shoes":
      return (
        <>
          <path
            transform="translate(8,12)"
            d="M6,16 L24,16 L24,82 L36,88 L38,104 L4,104 L4,86 Z"
          />
          <path
            transform="translate(50,16)"
            d="M6,16 L24,16 L24,82 L36,88 L38,104 L4,104 L4,86 Z"
          />
        </>
      );
    case "accessories":
      return (
        <>
          <path d="M22,44 L78,44 L84,116 L16,116 Z" />
          <path
            d="M36,44 C36,22 64,22 64,44"
            stroke="currentColor"
            strokeWidth="5"
            fill="none"
          />
        </>
      );
    case "tops":
    default:
      return (
        <path d="M36,12 L26,8 L6,28 L18,44 L28,34 L28,120 L72,120 L72,34 L82,44 L94,28 L74,8 L64,12 C60,20 40,20 36,12 Z" />
      );
  }
}

export function Garment({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 130"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ color: TINTS[category] }}
    >
      <Shape category={category} />
    </svg>
  );
}
