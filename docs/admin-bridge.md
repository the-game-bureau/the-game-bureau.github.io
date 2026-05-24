# Public Admin Bridge

Public pages should not hard-code Mission Control toolbars or permanent admin links. Use the shared bridge at `site/assets/admin-bridge.js`.

The bridge reads the existing Mission Control admin session from localStorage, verifies the user against Supabase `admin_users`, and shows edit controls only for verified admins. Signed-out public visitors see nothing.

## Page-Level Wiring

Add a page role to the body and load the bridge near the end of the page:

```html
<body data-admin-page="mission-control">
  ...
  <script src="PATH_TO/site/assets/admin-bridge.js"></script>
</body>
```

Supported `data-admin-page` values:

- `mission-control` -> `mc/index.html`
- `game-run` -> `mc/builder.html`, using the current URL `?id=...`
- `gift-shop` -> `mc/giftshop.html`
- `winners-wall` -> `mc/photos.html`

## Contextual Edit Controls

Put contextual controls on the public record/card:

```html
<article data-admin-edit="game" data-admin-id="GAME_ID" data-admin-target=".actions">
```

Supported `data-admin-edit` values:

- `game` -> `mc/builder.html?id=GAME_ID`
- `game-run` -> `mc/builder.html?id={current URL id}`
- `gift-item` -> `mc/giftshop.html?item=ITEM_ID`
- `photo` -> `mc/photos.html?photo=PHOTO_ID`

Optional attributes:

- `data-admin-target=".selector"` appends the edit link inside a specific child.
- `data-admin-label="EDIT THING"` overrides the generated label.
- `data-admin-href="mc/custom.html?..."` overrides bridge routing.

## Auth Events

Mission Control auth changes are broadcast from `mc/admin-auth.js` via the `tgb-admin-auth-change` browser event. Keep that event in sync if another page creates or clears the admin session, so already-open public pages update without reload.
