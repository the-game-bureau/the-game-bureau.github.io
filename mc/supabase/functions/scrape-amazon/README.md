# scrape-amazon

Server-side fetch of an Amazon product page, returning a flat JSON payload
suitable for filling out a `gift_shop_items` row.

## Why a server-side function

The browser can't reach `amazon.com` directly — Amazon doesn't set CORS, varies
content based on User-Agent, and aggressively rate-limits unknown clients. A
Deno edge function on Supabase runs server-side, sets a desktop UA, and
returns a clean JSON object the admin page can render straight into the form.

## Endpoint

`POST {SUPABASE_URL}/functions/v1/scrape-amazon`

```json
{ "url": "https://www.amazon.com/dp/B07EXAMPLE" }
```

### Response

```json
{
  "title": "Field Notebook 3-pack",
  "description": "Pocket-sized notebooks ...",
  "image_url": "https://m.media-amazon.com/images/I/…",
  "price_display": "$12.99"
}
```

Any field may be empty if Amazon's HTML didn't expose it. The admin page
treats empty fields as "leave the form alone."

### Errors

```
400 { "error": "url is required" }
400 { "error": "Only Amazon URLs are supported." }
502 { "error": "Amazon fetch failed (503 Service Unavailable)" }
500 { "error": "<exception message>" }
```

## How it scrapes

In priority order, per field:

1. **Amazon-specific selectors** — `#productTitle`, `#corePrice_feature_div .a-offscreen`, `#landingImage[data-old-hires]`, `#feature-bullets` list items.
2. **JSON-LD `Product` schema** — `script[type="application/ld+json"]`. Reliable when present; gives `name`, `description`, `image`, `offers.price` + `priceCurrency`.
3. **Open Graph / Twitter / standard meta tags** — `og:title`, `og:image`, `og:description`. Always present, lowest fidelity.

First non-empty value wins.

## Deploying

You'll need the Supabase CLI: <https://supabase.com/docs/guides/cli/getting-started>.

```sh
# One-time
supabase login
supabase link --project-ref qmaafbncpzrdmqapkkgr

# Deploy / redeploy
supabase functions deploy scrape-amazon
```

That's it — no environment variables, no secrets. The default deploy keeps
JWT verification on, which means the function only accepts calls that include
a valid Supabase token in `Authorization: Bearer …`. The admin page sends
either the signed-in admin's access token or the publishable (anon) key, both
of which are accepted by JWT verification.

If you want fully open access (e.g. for a marketing landing page that fetches
without signing in), redeploy with `--no-verify-jwt`:

```sh
supabase functions deploy scrape-amazon --no-verify-jwt
```

## Local dev

```sh
supabase start
supabase functions serve scrape-amazon --no-verify-jwt
# then POST to http://127.0.0.1:54321/functions/v1/scrape-amazon
```

## Caveats

- Amazon ships HTML variants. Selectors can drift — if a particular layout
  starts returning empty results, add the new selector to `readAmazonDom` in
  `index.ts` rather than rewriting the function.
- Amazon's affiliate redirects (`amzn.to`, `a.co`) are followed automatically
  via `redirect: "follow"`. Final URL must still be on an `amazon.*` host or
  the function bails with a 400.
- This intentionally **does not** call the Amazon Product Advertising API.
  When you're approved for PA API access, swap `readAmazonDom` for an API
  call — same return shape, no other admin changes needed.
