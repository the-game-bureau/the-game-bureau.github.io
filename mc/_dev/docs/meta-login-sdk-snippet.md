# Facebook JavaScript SDK snippet — kept for reference, NOT installed

Handed over by the Facebook Login for Business Quickstart on 2026-08-06 while
setting up Meta posting for `/mc/socializer/`. Kept because it was asked for, not
because anything uses it.

```html
<script>
  window.fbAsyncInit = function() {
    FB.init({
      appId      : '{your-app-id}',
      cookie     : true,
      xfbml      : true,
      version    : '{api-version}'
    });

    FB.AppEvents.logPageView();

  };

  (function(d, s, id){
     var js, fjs = d.getElementsByTagName(s)[0];
     if (d.getElementById(id)) {return;}
     js = d.createElement(s); js.id = id;
     js.src = "https://connect.facebook.net/en_US/sdk.js";
     fjs.parentNode.insertBefore(js, fjs);
   }(document, 'script', 'facebook-jssdk'));
</script>
```

## Why it is not on any page

**It solves a problem we do not have.** This is a browser-side login SDK: it puts
a "Log in with Facebook" flow on a web page so *a visitor* can grant *our app*
access to *their* account. Our posting flow is the opposite shape — one admin,
already signed in, clicking Post, with the credential held server-side in the
`socials-post` Edge Function. No visitor ever authenticates with Meta.

Three concrete reasons not to add it:

- **It would load Facebook code on our pages.** `connect.facebook.net/en_US/sdk.js`
  is third-party script, and `FB.AppEvents.logPageView()` reports a page view to
  Meta on every load. The site currently has exactly one analytics beacon
  (Cloudflare, cookieless, no per-visitor id) chosen specifically so there is
  nothing to disclose in a privacy policy. This would change that.
- **It cannot post anyway.** A token obtained this way lives in the visitor's
  browser and carries their permissions, not the Page's. Publishing needs a Page
  token, server-side.
- **`cookie: true` sets a Facebook cookie**, which is a consent question in the
  EU and pointless when nobody is logging in.

## What it was actually for

The Quickstart appears when you add **Facebook Login for Business** to an app.
We only opened that because the Graph API Explorer's Configurations tab was
greyed out, and chasing the grey led here. Facebook Login for Business is for
letting *other businesses* connect *their* Pages to your app — a thing we will
never do, since we post to one Page we own.

The setup that matters is in
[mc/supabase/functions/socials-post/index.ts](../../supabase/functions/socials-post/index.ts):
one Page access token, one Supabase secret, no client-side anything.

If this snippet is ever genuinely wanted, `{your-app-id}` and `{api-version}`
are placeholders to fill — and the App ID is public by design, unlike the App
Secret, which must never reach a page.
