// Stripe checkout with a quantity.
//
// A Stripe Payment Link can't be told a quantity in its URL, so the ORDER button comes here instead:
//   GET <this function>?link=https://buy.stripe.com/xxxx&qty=3&back=https://thegamebureau.com/galaxy-210/
// It finds that Payment Link in the Stripe account, opens a Stripe Checkout with the same product,
// price, shipping and options, at the chosen quantity, and sends the buyer there.
// Anything that goes wrong sends the buyer to the Payment Link itself, so ordering never breaks.
//
// Runs as a Supabase Edge Function (Deno). Needs one secret: STRIPE_SECRET_KEY, a Stripe restricted key
// with "Checkout Sessions: Write" and "Payment Links: Read". Deploy with JWT verification off.
// No secrets live in this file or on the site.

const API = 'https://api.stripe.com/v1';
const BACK_HOSTS = /(^|\.)thegamebureau\.com$|^localhost$|^127\.0\.0\.1$/;

type Fetch = typeof fetch;
// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

const clean = (u: string) => u.split(/[?#]/)[0].replace(/\/+$/, '');

// Form-encode nested values the way the Stripe API expects (a[b][0]=c).
export function form(o: Obj, pre = '', out: string[] = []): string {
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const key = pre ? pre + '[' + k + ']' : k;
    if (typeof v === 'object') form(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}

// The Checkout Session that matches a Payment Link, at quantity qty.
export function sessionFor(link: Obj, items: Obj[], qty: number, back: string): Obj {
  const li = items.map((it, i) => {
    const adj = it.adjustable_quantity || {};
    const max = adj.enabled ? (adj.maximum || 99) : 999999;
    return {
      price: it.price.id,
      // The chosen quantity goes on the first item; any others keep their own.
      quantity: i === 0 ? Math.min(qty, max) : it.quantity,
      // The buyer can still change it at checkout, within the link's own limits.
      adjustable_quantity: { enabled: true, minimum: Math.max(1, adj.minimum || 1), maximum: max },
    };
  });
  const recurring = items.some(it => it.price && it.price.type === 'recurring');
  const done = link.after_completion || {};
  const s: Obj = {
    mode: recurring ? 'subscription' : 'payment',
    line_items: li,
    client_reference_id: 'qty-' + qty,
    metadata: { ...(link.metadata || {}), payment_link: link.id, quantity: String(qty) },
    success_url: done.type === 'redirect' && done.redirect && done.redirect.url
      ? done.redirect.url
      : back + (back.includes('#') ? '' : '#ordered'),
    cancel_url: back,
    allow_promotion_codes: link.allow_promotion_codes ? true : undefined,
    automatic_tax: link.automatic_tax && link.automatic_tax.enabled ? { enabled: true } : undefined,
    billing_address_collection: link.billing_address_collection === 'required' ? 'required' : undefined,
    phone_number_collection: link.phone_number_collection && link.phone_number_collection.enabled ? { enabled: true } : undefined,
    shipping_address_collection: link.shipping_address_collection && link.shipping_address_collection.allowed_countries
      ? { allowed_countries: link.shipping_address_collection.allowed_countries } : undefined,
    shipping_options: !recurring && (link.shipping_options || []).length
      ? link.shipping_options.map((o: Obj) => ({ shipping_rate: o.shipping_rate })) : undefined,
    customer_creation: !recurring && link.customer_creation === 'always' ? 'always' : undefined,
    invoice_creation: !recurring && link.invoice_creation && link.invoice_creation.enabled ? { enabled: true } : undefined,
  };
  if (link.custom_text) {
    const t: Obj = {};
    for (const k of ['shipping_address', 'submit', 'after_submit', 'terms_of_service_acceptance']) {
      if (link.custom_text[k] && link.custom_text[k].message) t[k] = { message: link.custom_text[k].message };
    }
    if (Object.keys(t).length) s.custom_text = t;
  }
  return s;
}

export async function handle(req: Request, key: string | undefined, f: Fetch = fetch): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const link = String(q.get('link') || '');
  const qty = Math.min(999, Math.max(1, Math.round(+(q.get('qty') || 1)) || 1));
  let back = String(q.get('back') || '');
  try { if (!BACK_HOSTS.test(new URL(back).hostname)) back = ''; } catch { back = ''; }
  if (!/^https:\/\/buy\.stripe\.com\/[\w-]+/i.test(link)) return new Response('Unknown order link.', { status: 400 });
  // The plain Payment Link, with the quantity noted, is the fallback for every failure below.
  const fallback = () => Response.redirect(clean(link) + '?client_reference_id=qty-' + qty, 303);
  if (!key) return fallback();
  const call = async (path: string, body?: string): Promise<Obj> => {
    const r = await f(API + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || 'Stripe ' + r.status);
    return j;
  };
  try {
    // Find the Payment Link by its address (only active links in this Stripe account count).
    let pl: Obj | undefined, after = '';
    for (let page = 0; page < 10 && !pl; page++) {
      const r = await call('/payment_links?active=true&limit=100' + (after ? '&starting_after=' + after : ''));
      pl = r.data.find((p: Obj) => clean(p.url) === clean(link));
      if (!r.has_more || !r.data.length) break;
      after = r.data[r.data.length - 1].id;
    }
    if (!pl) return fallback();
    if (!back) back = clean(link);
    const items = (await call('/payment_links/' + pl.id + '/line_items?limit=20')).data;
    if (!items || !items.length) return fallback();
    const s = await call('/checkout/sessions', form(sessionFor(pl, items, qty, back)));
    return Response.redirect(s.url, 303);
  } catch (e) {
    console.error(e);
    return fallback();
  }
}

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D && D.serve) D.serve((req: Request) => handle(req, D.env.get('STRIPE_SECRET_KEY')));
