import { type NextRequest, NextResponse } from "next/server";

// The one server-side piece: a stateless CORS workaround. `?url=` returns
// { title, ogImage } parsed from the page's meta tags; `&kind=image` proxies
// an image's bytes so the client can turn an og:image into a savable blob
// (remote CDNs rarely send CORS headers). Failures are graceful — a failed
// fetch must never block a save.

const TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512 * 1024; // meta tags live in <head>; don't parse megabytes
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (compatible; tasteboard-metadata/1.0; +https://tasteboard.vercel.app)";

function isPrivateHost(host: string): boolean {
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".local")
  ) {
    return true;
  }
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function parseTargetUrl(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (isPrivateHost(url.hostname)) return null;
  return url;
}

function extractMetaContent(html: string, name: string): string | null {
  const tag = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i"),
  )?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

const EMPTY = { title: null, ogImage: null };

export async function GET(req: NextRequest) {
  const url = parseTargetUrl(req.nextUrl.searchParams.get("url"));
  if (!url) return NextResponse.json(EMPTY, { status: 400 });

  if (req.nextUrl.searchParams.get("kind") === "image") {
    return proxyImage(url);
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("text/html")) {
      return NextResponse.json(EMPTY);
    }
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);

    const rawTitle =
      extractMetaContent(html, "og:title") ??
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ??
      null;
    const title = rawTitle ? decodeEntities(rawTitle) : null;

    const rawImage =
      extractMetaContent(html, "og:image") ??
      extractMetaContent(html, "twitter:image");
    let ogImage: string | null = null;
    if (rawImage) {
      try {
        // og:image may be relative; resolve against the final (post-redirect) URL
        ogImage = new URL(decodeEntities(rawImage), res.url || url).toString();
      } catch {
        ogImage = null;
      }
    }

    return NextResponse.json(
      { title, ogImage },
      { headers: { "cache-control": "public, s-maxage=86400" } },
    );
  } catch {
    return NextResponse.json(EMPTY);
  }
}

async function proxyImage(url: URL): Promise<NextResponse> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: { "user-agent": USER_AGENT },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.startsWith("image/")) {
      return new NextResponse(null, { status: 502 });
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return new NextResponse(null, { status: 502 });
    }
    return new NextResponse(bytes, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, s-maxage=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
