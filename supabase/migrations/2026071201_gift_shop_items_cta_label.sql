-- Optional per-item gift-shop button label.
--
-- The public shop derives the CTA button text from the item URL: Amazon and
-- Bookshop links are named ("View on Amazon" / "View on Bookshop"), and every
-- other link now falls back to "Visit Site". This column lets an admin override
-- that text per item — needed for manually-added *destination* links (e.g. a
-- city's official visitor guide) where the right words are "Request Guide",
-- "Get Tickets", "Learn More", etc. When null/blank, the URL-derived label wins.

alter table public.gift_shop_items
  add column if not exists cta_label text;

comment on column public.gift_shop_items.cta_label is
  'Optional gift-shop button label. When null the public shop derives the label from the URL (Amazon/Bookshop) or falls back to "Visit Site". Used for hand-added destination links like visitor guides.';
