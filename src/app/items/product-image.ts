"use server";

import { getSession } from "@/lib/auth";

export type ProductImageResult =
  | { ok: true; imageUrl: string }
  | { ok: false; error: string };

/**
 * Blocks the obvious SSRF targets. This app has one user, but the server will
 * fetch any URL typed into the box, so loopback and private ranges are refused.
 */
function isPublicHttpUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "[::1]") return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^169\.254\./.test(h)) return false;
  return true;
}

function metaContent(html: string, property: string): string | null {
  // Attribute order varies by site, so try content-last and content-first.
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Reads the listing's own preview image (the one that shows in a text message
 * or a Slack unfurl). Best-effort: plenty of retailers block server-side
 * requests or build the page in the browser, in which case there's nothing in
 * the HTML to find and you upload a photo yourself.
 */
export async function fetchProductImage(raw: string): Promise<ProductImageResult> {
  if (!(await getSession())) throw new Error("Unauthorized");

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That doesn't look like a link." };
  }
  if (!isPublicHttpUrl(url)) {
    return { ok: false, error: "That link can't be fetched." };
  }

  let html: string;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        // Sites serve a bare shell to obvious bots; ask like a browser.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `The site refused the request (${response.status}). Upload a photo instead.`,
      };
    }
    // Only the head matters, and product pages can be enormous.
    html = (await response.text()).slice(0, 300_000);
  } catch {
    return { ok: false, error: "Couldn't reach that page. Upload a photo instead." };
  }

  const found =
    metaContent(html, "og:image:secure_url") ??
    metaContent(html, "og:image") ??
    metaContent(html, "twitter:image") ??
    metaContent(html, "twitter:image:src");

  if (!found) {
    return {
      ok: false,
      error: "No preview image on that page. Upload a photo instead.",
    };
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(found, url); // resolves protocol-relative and relative paths
  } catch {
    return { ok: false, error: "That page's image link is malformed." };
  }
  if (!isPublicHttpUrl(imageUrl)) {
    return { ok: false, error: "That page's image can't be fetched." };
  }

  return { ok: true, imageUrl: imageUrl.toString() };
}
