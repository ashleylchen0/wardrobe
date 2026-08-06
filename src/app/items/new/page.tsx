import Link from "next/link";
import { ItemForm } from "@/components/item-form";
import { getBrands } from "../new-item-actions";

export const metadata = { title: "Add an item · Wardrobe" };

export default async function NewItemPage() {
  const brands = await getBrands();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Link href="/" className="eyebrow hover:text-ink transition-colors">
            ← Closet
          </Link>
          <h1 className="font-serif text-3xl tracking-tight">Add an item</h1>
          <p className="text-muted max-w-prose text-sm">
            Only the name and category are required. Everything else can wait —
            adding it now beats not adding it at all.
          </p>
        </div>

        <ItemForm brands={brands} />
      </div>
    </main>
  );
}
