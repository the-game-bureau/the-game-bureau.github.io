# Public Accounts

The public account flow uses Supabase Auth directly from the static site.

Files:

- `account/index.html` contains the public sign in, sign up, profile, and sign out UI.
- `assets/public-account.js` wraps Supabase Auth REST calls and stores the public session in `localStorage`.
- `assets/account-page.js` handles the account page forms.

No SQL table is required for the current version. The editable display name is stored in `auth.users.raw_user_meta_data` as `display_name`.

Supabase dashboard setup:

1. Go to Authentication, then Providers, and enable Email.
2. Go to Authentication, then URL Configuration.
3. Set the Site URL to `https://thegamebureau.com`.
4. Add redirect URLs for any environments you test from, such as:
   - `https://thegamebureau.com/account/`
   - `http://localhost:8000/account/`
5. Decide whether email confirmations are required. If confirmations are on, new users will see a message to check email before signing in.

The public account session is intentionally separate from the Studio admin session.
