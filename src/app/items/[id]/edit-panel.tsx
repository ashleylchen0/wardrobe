"use client";

import { useState } from "react";
import { ItemForm, type EditableItem } from "@/components/item-form";

/**
 * Editing is folded away by default: the page is for reading what a garment
 * has cost you, and a form standing open underneath that competes with it.
 */
export function EditPanel({
  item,
  brands,
}: {
  item: EditableItem;
  brands: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="microcap text-muted hover:text-ink cursor-pointer text-[9px] underline"
      >
        {open ? "Close editor" : "Edit item"}
      </button>

      {open && (
        <div className="mt-5">
          <ItemForm brands={brands} item={item} onSaved={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
