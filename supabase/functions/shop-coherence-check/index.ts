// shop-coherence-check — Supabase Edge Function
//
// "Do this gift's fields actually work together?" A smarter companion to the
// nightly URL health check: instead of only asking "does the link 200?", it
// asks whether the TITLE, the linked PRODUCT PAGE, the IMAGE, and the CITY all
// describe the same thing.
//
// For one item it:
//   1. (best effort) loads the gift_shop_items row + its listing cities, so the
//      caller only has to send an id (fields sent in the body win / fill gaps).
//   2. fetches the product URL server-side (desktop UA, no browser CORS) and
//      extracts the page's real title/description — EXCEPT bookshop.org, which
//      Cloudflare-403s datacenter scrapes, so page-match is skipped there.
//   3. asks Claude (vision) to compare OUR fields against the page + the image
//      and return a strict-JSON verdict flagging any mismatch.
//
// Gated to a signed-in user (admin tools send the admin JWT) so anonymous
// traffic can't burn Anthropic tokens. Returns:
//   { verdict, imageMatches, titleMatchesPage, cityOk, issues[], summary,
//     pageFetched, model }
//   verdict ∈ "ok" | "warn" | "mismatch" | "error"
//
// Setup:
//   Project Settings → Edge Functions → Secrets → ANTHROPIC_API_KEY  (already
//   set for anthropic-proxy — same key)
//   supabase functions deploy shop-coherence-check
//
// Invoke (browser, admin signed in):
//   fetch(`${SUPABASE_URL}/functions/v1/shop-coherence-check`, {
//     method: "POST",
//     headers: adminAuth.authHeaders({ "Content-Type": "application/json" }),
//     body: JSON.stringify({ id, title, url, image_url }),
//   })

import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.46/deno-dom-wasm.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SB_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MODEL = "claude-haiku-4-5-20251001";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BOOKSHOP_HOST_RE = /(?:^|\.)bookshop\.org$/;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  id?: string;
  title?: string;
  url?: string;
  image_url?: string;
  description?: string;
  cities?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not set in Supabase secrets." }, 500);
  }

  // Gate to a signed-in user so anon callers can't burn tokens. (RLS still
  // governs the item read below; we only confirm a real session here.)
  const authHeader = req.headers.get("Authorization") || "";
  const callerKey = req.headers.get("apikey") || SB_ANON_KEY;
  const user = await resolveUser(authHeader, callerKey);
  if (!user) return json({ error: "Sign in as an admin to run the AI check." }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  // Start from what the page sent; backfill description/cities (and any missing
  // title/url/image) from the DB by id, best-effort under the caller's JWT.
  const item = {
    id: String(body.id || "").trim(),
    title: String(body.title || "").trim(),
    url: String(body.url || "").trim(),
    image_url: String(body.image_url || "").trim(),
    description: String(body.description || "").trim(),
    cities: Array.isArray(body.cities) ? body.cities.map((c) => String(c)).filter(Boolean) : [],
  };
  if (item.id) {
    const fetched = await loadItem(item.id, authHeader, callerKey);
    if (fetched) {
      item.title ||= fetched.title;
      item.url ||= fetched.url;
      item.image_url ||= fetched.image_url;
      item.description ||= fetched.description;
      if (!item.cities.length) item.cities = fetched.cities;
    }
  }

  if (!item.title && !item.url && !item.image_url) {
    return json({ error: "Nothing to check — provide an id or title/url/image." }, 400);
  }

  // Pull the linked product page's real title/text (skip bookshop — it 403s
  // datacenter scrapes; the image is still checked there).
  const page = await fetchProductPage(item.url);

  // Ask Claude to reconcile our fields against the page + the image.
  try {
    const verdict = await runClaude(item, page);
    // Persist so the verdict survives reloads + the nightly regeneration
    // (best-effort; a storage hiccup shouldn't fail the check itself).
    if (item.id) {
      await saveVerdict(item.id, verdict, authHeader, callerKey, user).catch((e) =>
        console.error("[shop-coherence-check] save failed", e)
      );
    }
    return json({ ...verdict, pageFetched: page.fetched, model: MODEL }, 200);
  } catch (err) {
    console.error("[shop-coherence-check] claude error", err);
    return json(
      { verdict: "error", issues: [], summary: "AI check failed: " + (err instanceof Error ? err.message : String(err)), pageFetched: page.fetched, model: MODEL },
      502,
    );
  }
});

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

// GoTrue: resolve the bearer to a user (confirms a real session exists).
async function resolveUser(authHeader: string, apikey: string): Promise<unknown | null> {
  if (!SB_URL || !authHeader || !/^Bearer\s+/i.test(authHeader)) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey, Authorization: authHeader },
    });
    if (!res.ok) return null;
    const u = await res.json();
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

// Upsert the verdict into gift_shop_coherence under the caller's JWT (RLS =
// admins only). on_conflict=item_id so re-auditing an item overwrites it.
// deno-lint-ignore no-explicit-any
async function saveVerdict(id: string, v: Verdict, authHeader: string, apikey: string, user: any): Promise<void> {
  if (!SB_URL) return;
  const email = user && (user.email || (user.user_metadata && user.user_metadata.email)) || "";
  const row = {
    item_id: id,
    verdict: v.verdict,
    summary: v.summary,
    issues: v.issues,
    image_matches: v.imageMatches,
    title_matches_page: v.titleMatchesPage,
    city_ok: v.cityOk,
    checked_at: new Date().toISOString(),
    checked_by: email,
  };
  const res = await fetch(`${SB_URL}/rest/v1/gift_shop_coherence?on_conflict=item_id`, {
    method: "POST",
    headers: {
      apikey,
      Authorization: authHeader || `Bearer ${apikey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`store ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

interface DbItem { title: string; url: string; image_url: string; description: string; cities: string[]; }

// Read the item (+ its listing cities) under the caller's JWT, so RLS decides
// what they can see. Best-effort — any failure just leaves the body's fields.
async function loadItem(id: string, authHeader: string, apikey: string): Promise<DbItem | null> {
  if (!SB_URL) return null;
  const headers = { apikey, Authorization: authHeader || `Bearer ${apikey}`, Accept: "application/json" };
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/gift_shop_items?id=eq.${encodeURIComponent(id)}&select=title,url,image_url,description`,
      { headers },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    let cities: string[] = [];
    try {
      const cres = await fetch(
        `${SB_URL}/rest/v1/gift_shop_listings?item_id=eq.${encodeURIComponent(id)}&select=city`,
        { headers },
      );
      if (cres.ok) {
        const crows = await cres.json();
        cities = (Array.isArray(crows) ? crows : []).map((r) => String(r.city || "")).filter(Boolean);
      }
    } catch { /* cities are optional */ }
    return {
      title: String(row.title || "").trim(),
      url: String(row.url || "").trim(),
      image_url: String(row.image_url || "").trim(),
      description: String(row.description || "").trim(),
      cities,
    };
  } catch {
    return null;
  }
}

interface PageInfo { fetched: boolean; title: string; description: string; text: string; note: string; }

async function fetchProductPage(rawUrl: string): Promise<PageInfo> {
  const url = String(rawUrl || "").trim();
  const empty: PageInfo = { fetched: false, title: "", description: "", text: "", note: "" };
  if (!/^https?:\/\//i.test(url)) return { ...empty, note: "no product URL" };
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return { ...empty, note: "bad URL" }; }
  if (BOOKSHOP_HOST_RE.test(host)) {
    return { ...empty, note: "bookshop.org blocks server scrapes — page title not verified (image still checked)" };
  }
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": DESKTOP_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) return { ...empty, note: `page fetch ${res.status}` };
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) return { ...empty, note: "page unparseable" };
    const meta = (sel: string) => {
      const el = doc.querySelector(sel) as Element | null;
      return el ? String(el.getAttribute("content") || "").trim() : "";
    };
    const title =
      (doc.querySelector("#productTitle") as Element | null)?.textContent?.replace(/\s+/g, " ").trim() ||
      meta('meta[property="og:title"]') ||
      (doc.querySelector("title") as Element | null)?.textContent?.replace(/\s+/g, " ").trim() ||
      "";
    const description =
      meta('meta[property="og:description"]') ||
      meta('meta[name="description"]') || "";
    // A little raw body text as extra context for the model (bounded).
    const bodyText = String((doc.querySelector("body") as Element | null)?.textContent || "")
      .replace(/\s+/g, " ").trim().slice(0, 3000);
    return { fetched: true, title, description, text: bodyText, note: "" };
  } catch (err) {
    return { ...empty, note: "page fetch error: " + (err instanceof Error ? err.message : String(err)) };
  }
}

interface Verdict {
  verdict: "ok" | "warn" | "mismatch";
  imageMatches: boolean | null;
  titleMatchesPage: boolean | null;
  cityOk: boolean | null;
  issues: string[];
  summary: string;
}

async function runClaude(item: { title: string; url: string; image_url: string; description: string; cities: string[]; }, page: PageInfo): Promise<Verdict> {
  const pageBlock = page.fetched
    ? `LINKED PAGE (fetched from the product URL):\n  page title: ${page.title || "(none)"}\n  page description: ${page.description || "(none)"}\n  page text (truncated): ${page.text || "(none)"}`
    : `LINKED PAGE: not fetched (${page.note || "unavailable"}). Do NOT flag a title/page mismatch in this case; set titleMatchesPage to null.`;

  const instructions =
    `You are auditing one gift-shop listing to check its fields are consistent with each other and with the real product.\n\n` +
    `OUR STORED FIELDS:\n` +
    `  title: ${item.title || "(none)"}\n` +
    `  description: ${item.description || "(none)"}\n` +
    `  product url: ${item.url || "(none)"}\n` +
    `  cities it's filed under: ${item.cities.length ? item.cities.join("; ") : "(none)"}\n\n` +
    `${pageBlock}\n\n` +
    `THE IMAGE above (if provided) is the product image we show shoppers.\n\n` +
    `Decide whether everything describes the SAME product:\n` +
    `  - imageMatches: does the image plausibly depict the item named in OUR title/description? (null if no image was provided or it could not be read)\n` +
    `  - titleMatchesPage: does OUR title/description match the product on the linked page? (null if the page was not fetched)\n` +
    `  - cityOk: if OUR fields clearly reference a place, is it consistent with the filed cities? (null if there's no place signal to judge)\n` +
    `Be conservative: only flag a real, specific inconsistency (e.g. image is a coffee mug but title says a book; page is a different product; title says "Chicago" but filed under Boston). Vague or stylistic differences are NOT issues.\n\n` +
    `Reply with ONLY a JSON object, no prose, exactly this shape:\n` +
    `{"verdict":"ok|warn|mismatch","imageMatches":true|false|null,"titleMatchesPage":true|false|null,"cityOk":true|false|null,"issues":["short specific problem", "..."],"summary":"one short sentence"}\n` +
    `verdict = "ok" when nothing is wrong, "mismatch" for a clear contradiction, "warn" for a probable-but-uncertain problem.`;

  // deno-lint-ignore no-explicit-any
  const content: any[] = [];
  const img = item.image_url;
  if (/^https?:\/\//i.test(img)) {
    content.push({ type: "image", source: { type: "url", url: img } });
  }
  content.push({ type: "text", text: instructions });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    // If the image URL couldn't be fetched by Anthropic, retry text-only.
    const detail = (await res.text()).slice(0, 400);
    if (content.length > 1 && /image|media|url|fetch/i.test(detail)) {
      return await runClaudeTextOnly(instructions, detail);
    }
    throw new Error(`Anthropic ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return parseVerdict(data?.content?.[0]?.text ?? "");
}

async function runClaudeTextOnly(instructions: string, priorDetail: string): Promise<Verdict> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content: [{ type: "text", text: instructions + "\n\n(Note: the product image could not be loaded, so set imageMatches to null.)" }] }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${priorDetail}`);
  const data = await res.json();
  return parseVerdict(data?.content?.[0]?.text ?? "");
}

function parseVerdict(text: string): Verdict {
  const fallback: Verdict = { verdict: "warn", imageMatches: null, titleMatchesPage: null, cityOk: null, issues: [], summary: "Could not parse the AI response." };
  const raw = String(text || "");
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return fallback;
  try {
    const o = JSON.parse(m[0]);
    const v = o.verdict === "ok" || o.verdict === "mismatch" ? o.verdict : "warn";
    return {
      verdict: v,
      imageMatches: typeof o.imageMatches === "boolean" ? o.imageMatches : null,
      titleMatchesPage: typeof o.titleMatchesPage === "boolean" ? o.titleMatchesPage : null,
      cityOk: typeof o.cityOk === "boolean" ? o.cityOk : null,
      issues: Array.isArray(o.issues) ? o.issues.map((x: unknown) => String(x)).filter(Boolean).slice(0, 8) : [],
      summary: String(o.summary || "").slice(0, 300),
    };
  } catch {
    return fallback;
  }
}
