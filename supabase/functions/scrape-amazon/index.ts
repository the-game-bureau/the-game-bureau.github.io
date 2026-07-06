// scrape-amazon — Supabase Edge Function
//
// Fetches an Amazon or Bookshop.org product page and returns:
//   { title, description, image_url, price_display }
//
// (Name kept as scrape-amazon so the deployed endpoint / config stays stable;
// it now also accepts bookshop.org, extracted via the generic OG/JSON-LD path.)
//
// Why server-side: Amazon blocks browser CORS, varies content by
// User-Agent, and 429s anonymous traffic aggressively. Running this
// from a Deno edge function lets us send a desktop UA and pull the
// fields out of OG tags / JSON-LD product schema / a few Amazon
// selectors, in priority order.
//
// Invoke (browser):
//   const res = await fetch(
//     `${SUPABASE_URL}/functions/v1/scrape-amazon`,
//     {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         apikey: SUPABASE_PUBLISHABLE_KEY,
//         Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
//       },
//       body: JSON.stringify({ url: amazonUrl }),
//     },
//   );
//
// Deploy:
//   supabase functions deploy scrape-amazon

import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.46/deno-dom-wasm.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const AMAZON_HOST_RE = /(?:^|\.)amazon\.[a-z.]+$|(?:^|\.)amzn\.[a-z]+$|^a\.co$/;
const BOOKSHOP_HOST_RE = /(?:^|\.)bookshop\.org$/;

// Optional Google Books API key. The keyless quota is shared globally and is
// frequently exhausted (429), so set one for reliable Bookshop lookups:
//   supabase secrets set GOOGLE_BOOKS_API_KEY=<key>
const GOOGLE_BOOKS_KEY = Deno.env.get("GOOGLE_BOOKS_API_KEY") ?? "";

// Bookshop.org affiliate id — used to build a "link if missing" for book
// lookups (from an ISBN/title). Override with: supabase secrets set
// BOOKSHOP_AFFILIATE_ID=<id>
const BOOKSHOP_AFFILIATE_ID = Deno.env.get("BOOKSHOP_AFFILIATE_ID") ?? "87073";

interface ScrapeResult {
  title: string;
  description: string;
  image_url: string;
  price_display: string;
  url?: string; // suggested link (e.g. a Bookshop affiliate link for a book)
  author?: string; // book author(s), so the client can append "by …" if needed
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const input = await readUrl(req);
    if (!input) return json({ error: "Provide a link, ISBN, or title." }, 400);

    // No link needed: a bare ISBN or free-text title searches Google Books.
    if (!/^https?:\/\//i.test(input)) {
      const result = looksLikeIsbn(input)
        ? await fromIsbn(extractIsbn(input))
        : await fromQuery(input);
      if (result) return json(result, 200);
      return json({
        error: GOOGLE_BOOKS_KEY
          ? "No match — fill the fields manually."
          : "Set a GOOGLE_BOOKS_API_KEY secret for reliable lookups, or fill the fields manually.",
      }, 502);
    }

    const targetUrl = input;
    const hostname = (() => {
      try {
        return new URL(targetUrl).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    const isAmazon = AMAZON_HOST_RE.test(hostname);
    const isBookshop = BOOKSHOP_HOST_RE.test(hostname);
    if (!hostname || (!isAmazon && !isBookshop)) {
      return json({ error: "Only Amazon or Bookshop.org URLs are supported." }, 400);
    }

    // Bookshop.org sits behind Cloudflare and 403s server-side scrapes from
    // datacenter IPs. Its URLs carry the book's ISBN, so pull metadata from the
    // Google Books + Open Library APIs by ISBN instead of fetching the page.
    if (isBookshop) {
      const isbn = extractIsbn(targetUrl);
      if (isbn) {
        const fromApi = await fromIsbn(isbn);
        if (fromApi) return json(fromApi, 200);
      }
      return json(
        {
          error: GOOGLE_BOOKS_KEY
            ? "No book match for that Bookshop link — fill the fields manually."
            : "Bookshop blocks automated scraping. Set a GOOGLE_BOOKS_API_KEY secret for reliable lookups, or fill the fields manually.",
        },
        502,
      );
    }

    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": DESKTOP_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return json(
        { error: `Product page fetch failed (${upstream.status} ${upstream.statusText})` },
        502,
      );
    }
    const html = await upstream.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) return json({ error: "Could not parse Amazon page." }, 500);

    const result = extract(doc);
    return json(result, 200);
  } catch (err) {
    console.error("[scrape-amazon] error", err);
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

async function readUrl(req: Request): Promise<string> {
  if (req.method === "POST") {
    try {
      const body = await req.json();
      return String(body?.url || "").trim();
    } catch {
      return "";
    }
  }
  const url = new URL(req.url);
  return String(url.searchParams.get("url") || "").trim();
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Bookshop.org via ISBN → Google Books (title/description) + Open Library
// (cover image). Avoids scraping the Cloudflare-protected page entirely.
// ──────────────────────────────────────────────────────────────────────

function extractIsbn(text: string): string {
  // ISBN-13 (978/979 + 10 digits) first, then ISBN-10 (9 digits + digit/X).
  const m = text.match(/(97[89]\d{10}|\d{9}[\dxX])/);
  return m ? m[1].toUpperCase() : "";
}

// True when the whole input is just an ISBN (ignoring spaces/hyphens).
function looksLikeIsbn(text: string): boolean {
  const cleaned = text.replace(/[\s-]/g, "");
  return /^(97[89]\d{10}|\d{9}[\dxX])$/.test(cleaned);
}

// One Google Books volume for an arbitrary query ("isbn:…" or free text).
// deno-lint-ignore no-explicit-any
async function googleVolume(query: string): Promise<any | null> {
  try {
    const keyParam = GOOGLE_BOOKS_KEY ? `&key=${encodeURIComponent(GOOGLE_BOOKS_KEY)}` : "";
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1${keyParam}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.items?.[0]?.volumeInfo ?? null;
  } catch {
    return null;
  }
}

async function fromIsbn(isbn: string): Promise<ScrapeResult | null> {
  return await resultFromVolume(await googleVolume(`isbn:${isbn}`), isbn);
}

async function fromQuery(query: string): Promise<ScrapeResult | null> {
  return await resultFromVolume(await googleVolume(query), "");
}

// Build a fill result from a Google Books volume (title "…by Author", cleaned
// description, best cover). Falls back to an Open-Library-cover-only result when
// there's no volume but we do have an ISBN.
// deno-lint-ignore no-explicit-any
async function resultFromVolume(info: any, isbn: string): Promise<ScrapeResult | null> {
  if (!info) {
    if (!isbn) return null;
    const image = await coverForIsbn(isbn, "");
    return image
      ? { title: "", description: "", image_url: image, price_display: "", url: bookshopLink(isbn) }
      : null;
  }
  let title = String(info.title || "").trim();
  const sub = String(info.subtitle || "").trim();
  if (sub) title = title ? `${title}: ${sub}` : sub;
  const authors = (Array.isArray(info.authors) ? info.authors : [])
    .map((a: unknown) => String(a).trim())
    .filter(Boolean);
  const authorStr = authors.join(", ");
  if (title && authorStr) title = `${title} by ${authorStr}`;
  const description = String(info.description || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const links = info.imageLinks || {};
  const googleThumb = String(
    links.extraLarge || links.large || links.medium ||
      links.thumbnail || links.smallThumbnail || "",
  ).trim().replace(/^http:/, "https:").replace(/&edge=curl/g, "");
  const idIsbn = isbn || isbnFromVolume(info);
  const image = idIsbn ? await coverForIsbn(idIsbn, googleThumb) : googleThumb;
  if (!title && !description && !image) return null;
  return {
    title,
    description,
    image_url: image,
    price_display: "",
    url: idIsbn ? bookshopLink(idIsbn) : "",
    author: authorStr,
  };
}

function bookshopLink(isbn: string): string {
  return `https://bookshop.org/a/${BOOKSHOP_AFFILIATE_ID}/${encodeURIComponent(isbn)}`;
}

// deno-lint-ignore no-explicit-any
function isbnFromVolume(info: any): string {
  const ids = Array.isArray(info?.industryIdentifiers) ? info.industryIdentifiers : [];
  // deno-lint-ignore no-explicit-any
  const pick = (t: string) => ids.find((x: any) => x?.type === t)?.identifier;
  return String(pick("ISBN_13") || pick("ISBN_10") || "").replace(/[^\dxX]/g, "").toUpperCase();
}

async function coverForIsbn(isbn: string, fallback: string): Promise<string> {
  // Prefer a large Open Library cover; only use it if one actually exists.
  const base = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
  try {
    const res = await fetch(`${base}?default=false`, { method: "HEAD" });
    if (res.ok) return base;
  } catch {
    // ignore
  }
  // Bookshop's Ingram cover CDN (keyed by ISBN) is a reliable, good-size book
  // cover — the browser loads it fine even though a datacenter HEAD gets 403,
  // so return it blind. (The small Google thumbnail is only a last resort.)
  return `https://images-us.bookshop.org/ingram/${encodeURIComponent(isbn)}.jpg` || fallback;
}

// ──────────────────────────────────────────────────────────────────────
// Extraction. We try (in order, per field):
//   1. Amazon-specific DOM selectors (best when they work)
//   2. JSON-LD Product schema
//   3. Open Graph / Twitter / standard meta tags
// First non-empty value wins.
// ──────────────────────────────────────────────────────────────────────

function extract(doc: ReturnType<typeof parse>): ScrapeResult {
  const og = readOg(doc);
  const ld = readJsonLd(doc);
  const az = readAmazonDom(doc);

  return {
    title: az.title || ld.title || og.title,
    description: az.description || ld.description || og.description,
    image_url: az.image || ld.image || og.image,
    price_display: az.price || ld.price || "",
  };
}

// dummy parse type for the helpers — unused at runtime, just gives us
// a single name to pass around in TS.
function parse() {
  return null as unknown as ReturnType<DOMParser["parseFromString"]>;
}

interface Fields {
  title: string;
  description: string;
  image: string;
  price?: string;
}

function readOg(doc: NonNullable<ReturnType<typeof parse>>): Fields {
  const meta = (selector: string) => {
    const el = doc.querySelector(selector) as Element | null;
    return el ? String(el.getAttribute("content") || "").trim() : "";
  };
  return {
    title:
      meta('meta[property="og:title"]') ||
      meta('meta[name="twitter:title"]') ||
      meta('meta[name="title"]') ||
      "",
    description:
      meta('meta[property="og:description"]') ||
      meta('meta[name="twitter:description"]') ||
      meta('meta[name="description"]') ||
      "",
    image:
      meta('meta[property="og:image"]') ||
      meta('meta[name="twitter:image"]') ||
      "",
  };
}

function readJsonLd(doc: NonNullable<ReturnType<typeof parse>>): Fields {
  const out: Fields = { title: "", description: "", image: "", price: "" };
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  // deno-lint-ignore no-explicit-any
  const findProduct = (obj: any): any => {
    if (!obj || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findProduct(item);
        if (found) return found;
      }
      return null;
    }
    const types = ([] as string[]).concat(obj["@type"] || []);
    // "Book" covers Bookshop.org listings; "Product" covers Amazon + most others.
    if (types.includes("Product") || types.includes("Book")) return obj;
    if (obj["@graph"]) return findProduct(obj["@graph"]);
    return null;
  };

  for (const script of scripts) {
    const raw = String((script as Element).textContent || "").trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const product = findProduct(data);
      if (!product) continue;
      if (!out.title) out.title = String(product.name || "").trim();
      if (!out.description) out.description = String(product.description || "").trim();
      if (!out.image) {
        const img = product.image;
        out.image = Array.isArray(img)
          ? String(img[0] || "").trim()
          : String(img || "").trim();
      }
      if (!out.price) {
        const offers = product.offers;
        const list = Array.isArray(offers) ? offers : (offers ? [offers] : []);
        for (const offer of list) {
          const p =
            offer?.price ??
            offer?.lowPrice ??
            offer?.priceSpecification?.price;
          if (p == null) continue;
          const currency =
            offer?.priceCurrency ||
            offer?.priceSpecification?.priceCurrency ||
            "USD";
          out.price = formatPrice(p, currency);
          break;
        }
      }
    } catch {
      // bad JSON; ignore
    }
  }
  return out;
}

function readAmazonDom(doc: NonNullable<ReturnType<typeof parse>>): Fields {
  const text = (selector: string) => {
    const el = doc.querySelector(selector) as Element | null;
    return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : "";
  };

  // Title
  const title = text("#productTitle");

  // Price — Amazon has a half-dozen historical layouts.
  const priceSelectors = [
    "#corePrice_feature_div .a-price .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#apex_desktop .a-price .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    "#priceblock_saleprice",
    "#price_inside_buybox",
    ".a-price .a-offscreen",
  ];
  let price = "";
  for (const sel of priceSelectors) {
    price = text(sel);
    if (price) break;
  }

  // Image — prefer a high-res variant when offered.
  let image = "";
  const imgEl = (doc.querySelector("#landingImage") ||
    doc.querySelector("#imgBlkFront") ||
    doc.querySelector("#main-image")) as Element | null;
  if (imgEl) {
    image = String(
      imgEl.getAttribute("data-old-hires") ||
        imgEl.getAttribute("data-a-dynamic-image")?.match(/"(https?:[^"]+)"/)?.[1] ||
        imgEl.getAttribute("src") ||
        "",
    ).trim();
  }

  // Description — Amazon's "feature bullets" are the closest thing to
  // a short blurb; join them into one line. Fall back to product
  // description if bullets are absent.
  const bullets: string[] = [];
  const bulletEls = doc.querySelectorAll(
    "#feature-bullets ul li:not(.aok-hidden) span.a-list-item",
  );
  for (const b of bulletEls) {
    const t = String((b as Element).textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (t) bullets.push(t);
  }
  let description = bullets.join(" • ");
  if (!description) {
    description = text("#productDescription") || text("#bookDescription_feature_div");
  }

  return { title, description, image, price };
}

function formatPrice(price: unknown, currency: string): string {
  const n = typeof price === "number" ? price : parseFloat(String(price));
  if (Number.isNaN(n)) return "";
  const fixed = n.toFixed(2);
  if (currency === "USD") return `$${fixed}`;
  if (currency === "EUR") return `€${fixed}`;
  if (currency === "GBP") return `£${fixed}`;
  if (currency === "CAD") return `CA$${fixed}`;
  return `${fixed} ${currency}`;
}
