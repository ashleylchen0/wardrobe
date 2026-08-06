import { head } from "@vercel/blob";
import { getSession } from "@/lib/auth";

/**
 * Serves photos from the private Blob store. Middleware already gates this
 * route; the session check here is belt-and-braces so a matcher change can't
 * silently expose the store.
 *
 * Blob pathnames carry a random suffix and are never reused, so the response
 * is immutable — but `private` keeps it out of any shared cache.
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
    const blob = await head(pathname);
    const upstream = await fetch(blob.downloadUrl);
    if (!upstream.ok || !upstream.body) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": blob.contentType ?? "application/octet-stream",
        "Content-Length": String(blob.size),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
