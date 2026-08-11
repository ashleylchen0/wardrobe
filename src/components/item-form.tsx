"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { createItem, updateItem } from "@/app/items/item-actions";
import { fetchProductImage } from "@/app/items/product-image";

/** The fields this form can edit, as the detail page has them. */
export type EditableItem = {
  id: string;
  name: string;
  brand: string | null;
  category: Category;
  costCents: number | null;
  acquiredOn: string | null;
  acquiredPrecision: string | null;
  tags: string[];
  productUrl: string | null;
  notes: string | null;
};

/**
 * The full item form, used both to add and to edit. Only name and category are
 * required — 60 of the imported items have no cost and 29 no date, so demanding
 * either would be the wrong shape for how this wardrobe actually gets recorded.
 *
 * Passing `item` switches it to editing that item; `onSaved` lets the caller
 * close the disclosure it sits in.
 */
export function ItemForm({
  brands,
  item,
  onSaved,
}: {
  brands: string[];
  item?: EditableItem;
  onSaved?: () => void;
}) {
  const editing = item !== undefined;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<Category>(item?.category ?? "tops");
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [productUrl, setProductUrl] = useState(item?.productUrl ?? "");
  // Deliberately not persisted: once fetched, the picture lives in blob storage
  // and the link it came from stops mattering.
  const [imageLink, setImageLink] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);
  const [direct, setDirect] = useState(false);
  const [fetching, setFetching] = useState(false);

  // A date input can only hold a full date, so a year-only acquisition shows as
  // blank. The action preserves it unless a real date is chosen here.
  const acquiredValue =
    item?.acquiredPrecision === "day" ? (item.acquiredOn ?? "") : "";

  async function grabImage(source: string) {
    setFetching(true);
    setImageNote(null);
    try {
      const result = await fetchProductImage(source);
      if (result.ok) {
        setImageUrl(result.imageUrl);
        setDirect(result.direct);
      } else {
        setImageUrl(null);
        setImageNote(result.error);
      }
    } catch {
      setImageNote("Couldn't fetch that page. Upload a photo instead.");
    } finally {
      setFetching(false);
    }
  }

  /**
   * Handled through onSubmit rather than the `action` prop: React resets an
   * uncontrolled form once a form action resolves, which would wipe everything
   * you typed the moment the name collided with an existing item.
   */
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSuggestion(null);
    formData.set("category", category);
    if (imageUrl) formData.set("imageUrl", imageUrl);

    startTransition(async () => {
      const result = item
        ? await updateItem(item.id, formData)
        : await createItem(formData);

      if (result.ok) {
        if (item) {
          setImageUrl(null);
          router.refresh();
          onSaved?.();
        } else {
          router.push(`/items/${result.id}`);
        }
        return;
      }
      setError(result.error);
      setSuggestion(result.suggestion ?? null);
    });
  }

  function useSuggestion() {
    const input = formRef.current?.elements.namedItem("name");
    if (input instanceof HTMLInputElement && suggestion) {
      input.value = suggestion;
      setSuggestion(null);
      setError(null);
      input.focus();
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex max-w-xl flex-col gap-6">
      <Field label="Item name" hint="How you'd refer to it when logging an outfit">
        <input
          name="name"
          required
          autoFocus={!editing}
          defaultValue={item?.name}
          maxLength={120}
          className="border-hair focus:border-ink w-full border bg-card px-3 py-2 text-sm outline-none"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Brand" hint="Pick an existing one to keep the filter tidy">
          <input
            name="brand"
            list="brand-options"
            defaultValue={item?.brand ?? ""}
            maxLength={80}
            className="border-hair focus:border-ink w-full border bg-card px-3 py-2 text-sm outline-none"
          />
          <datalist id="brand-options">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>

        <Field label="Cost" hint="Leave blank if you don't know — that's not the same as free">
          <div className="border-hair focus-within:border-ink flex items-center gap-1 border bg-card px-3 py-2">
            <span className="text-muted text-sm">$</span>
            <input
              name="cost"
              inputMode="decimal"
              defaultValue={
                item?.costCents != null ? (item.costCents / 100).toFixed(2) : ""
              }
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </Field>
      </div>

      <Field label="Category">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`px-3 py-1 text-xs capitalize transition-colors ${
                category === c
                  ? "bg-ink text-paper"
                  : "border-hair text-muted hover:border-ink border"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Acquired"
          hint={
            editing && item?.acquiredPrecision === "year"
              ? `Recorded as ${item.acquiredOn?.slice(0, 4)} — year only, which a date field can't show. Leave blank to keep it.`
              : "Opens a calendar — leave blank if unknown"
          }
        >
          <input
            type="date"
            name="acquiredOn"
            defaultValue={acquiredValue}
            max={new Date().toISOString().slice(0, 10)}
            className="border-hair focus:border-ink w-full border bg-card px-3 py-2 text-sm tabular-nums outline-none"
          />
        </Field>

        <Field label="Tags" hint="Comma separated, e.g. workout">
          <input
            name="tags"
            defaultValue={item?.tags.join(", ") ?? ""}
            className="border-hair focus:border-ink w-full border bg-card px-3 py-2 text-sm outline-none"
          />
        </Field>
      </div>

      {/* Two boxes, because they answer different questions: the listing is
          where to go and look at the thing, the image link is which picture you
          actually want. A listing's own preview is often a model shot or a
          collage, so being able to name the image directly matters. */}
      <Field
        label="Product link"
        hint="Optional. Saved with the item so you can reopen the listing later."
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            name="productUrl"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://"
            className="border-hair focus:border-ink min-w-56 flex-1 border bg-card px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => grabImage(productUrl)}
            disabled={!productUrl.trim() || fetching}
            className="border-hair hover:border-ink border px-4 py-2 text-xs whitespace-nowrap transition-colors disabled:opacity-40"
          >
            {fetching ? "Fetching…" : "Use page's photo"}
          </button>
        </div>
      </Field>

      <Field
        label="Image link"
        hint="Optional. A link to the picture itself — right-click an image on the site and copy its address. Not stored; the file is copied into your own storage, so it survives the original coming down."
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            value={imageLink}
            onChange={(e) => setImageLink(e.target.value)}
            placeholder="https://…/photo.jpg"
            aria-label="Image link"
            className="border-hair focus:border-ink min-w-56 flex-1 border bg-card px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => grabImage(imageLink)}
            disabled={!imageLink.trim() || fetching}
            className="border-hair hover:border-ink border px-4 py-2 text-xs whitespace-nowrap transition-colors disabled:opacity-40"
          >
            {fetching ? "Fetching…" : "Use this image"}
          </button>
        </div>
      </Field>

      {imageUrl && (
        <div className="border-hair flex items-center gap-4 border bg-card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote preview, not yet stored */}
          <img
            src={imageUrl}
            alt="Preview from the product page"
            // Contained on the tile, like every stored photo: `cover` crops a
            // cutout into a square and hides how it will actually be framed.
            className="bg-tile size-20 object-contain p-[7%]"
          />
          <div className="flex flex-col gap-1 text-sm">
            <span>{direct ? "Using that image." : "Found a photo on that page."}</span>
            <span className="text-muted text-xs">
              It gets copied into your storage when you{" "}
              {editing ? "save" : "add the item"}.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setImageUrl(null)}
            className="text-muted hover:text-cpw-bad ml-auto text-xs"
          >
            Discard
          </button>
        </div>
      )}

      {imageNote && !imageUrl && (
        <p className="text-muted text-xs">{imageNote}</p>
      )}

      <Field label="Notes">
        <textarea
          name="notes"
          defaultValue={item?.notes ?? ""}
          rows={2}
          maxLength={500}
          className="border-hair focus:border-ink w-full resize-y border bg-card px-3 py-2 text-sm outline-none"
        />
      </Field>

      {error && (
        <div className="border-cpw-bad/40 bg-cpw-bad/5 text-cpw-bad flex flex-wrap items-center gap-2 border px-4 py-3 text-sm">
          <span>{error}</span>
          {suggestion && (
            <button
              type="button"
              onClick={useSuggestion}
              className="text-ink underline underline-offset-4"
            >
              Use “{suggestion}” instead
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink hover:bg-ink/90 px-5 py-2 text-sm font-medium text-paper transition-colors disabled:opacity-50"
        >
          {pending
            ? editing
              ? "Saving…"
              : "Adding…"
            : editing
              ? "Save changes"
              : "Add to closet"}
        </button>
        <p className="text-muted text-xs">
          {editing
            ? "Wear history and photo are unaffected."
            : "You can add a photo on the next screen."}
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-muted text-xs">{hint}</span>}
    </label>
  );
}
