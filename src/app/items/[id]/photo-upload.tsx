"use client";

import { useRef, useState, useTransition } from "react";
import { removePhoto, uploadPhoto } from "../photo-actions";

const MAX_EDGE = 1200;
const QUALITY = 0.82;

/**
 * Downscales in the browser before uploading. Phone photos are 3-6 MB, which
 * would blow past the server action body limit and waste storage on a gallery
 * that renders at a few hundred pixels — this keeps them around 100-200 KB.
 */
async function downscale(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY),
  );
  if (!blob) return file;

  return new File([blob], "photo.webp", { type: "image/webp" });
}

export function PhotoUpload({
  itemId,
  hasPhoto,
}: {
  itemId: string;
  hasPhoto: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setWorking(true);
    try {
      const resized = await downscale(file);
      const formData = new FormData();
      formData.set("photo", resized);
      const result = await uploadPhoto(itemId, formData);
      if (result && "error" in result && result.error) setError(result.error);
    } catch {
      setError("Upload failed. Try again?");
    } finally {
      setWorking(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = working || pending;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="border-hair hover:border-ink border px-4 py-1.5 text-xs transition-colors disabled:opacity-50"
        >
          {busy ? "Uploading…" : hasPhoto ? "Replace photo" : "Upload photo"}
        </button>

        {hasPhoto && !busy && (
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await removePhoto(itemId);
              })
            }
            className="text-muted hover:text-cpw-bad px-3 py-1.5 text-xs transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error && <p className="text-cpw-bad text-xs">{error}</p>}
    </div>
  );
}
