// scrape-amazon — Supabase Edge Function
//
// Fetches an Amazon product page and returns:
//   { title, description, image_url, price_display }
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

interface ScrapeResult {
  title: string;
  description: string;
  image_url: string;
  price_display: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const targetUrl = await readUrl(req);
    if (!targetUrl) return json({ error: "url is required" }, 400);
    if (!/^https?:\/\//i.test(targetUrl)) {
      return json({ error: "url must be http(s)" }, 400);
    }

    const hostname = (() => {
      try {
        return new URL(targetUrl).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    if (!hostname || !AMAZON_HOST_RE.test(hostname)) {
      return json({ error: "Only Amazon URLs are supported." }, 400);
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
        { error: `Amazon fetch failed (${upstream.status} ${upstream.statusText})` },
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
    if (types.includes("Product")) return obj;
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
