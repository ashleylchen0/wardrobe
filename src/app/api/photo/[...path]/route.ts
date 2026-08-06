import { get } from "@vercel/blob";
import { getSession } from "@/lib/auth";

/**
 * Serves photos from the private Blob store. `proxy.ts` already gates this
 * route; the session check here is belt-and-braces so a matcher change can't
 * silently expose the store.
 *
 * Private blobs are not fetchable by URL — a plain GET returns 403 — so this
 * uses `get(pathname, { access: "private" })`, which authenticates with the
 * store and hands back a stream.
 *
 * Blob pathnames carry a random suffix and are never reused, so responses are
 * immutable; `private` keeps them out of any shared cache.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!(await getSession())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { path } = await params;
  const pathname = path.map(decodeURIComponent).join("/");

  try {
    const result = await get(pathname, { access: "private" });
    if (!result) return new Response("Not found", { status: 404 });

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType ?? "application/octet-stream",
        "Content-Length": String(result.blob.size),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
