# Deployment

Live site: https://freshprice-eta.vercel.app · Code: https://github.com/RanjeetLokhande/freshprice

Every push to `main` redeploys automatically on Vercel.

## Vercel environment variables

Set both as **Type: Config** (not Secret). The `NEXT_PUBLIC_` prefix means they're sent to the browser, and the publishable key is designed to be public.

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |

## Supabase → Authentication → URL Configuration

- **Site URL:** `https://freshprice-eta.vercel.app`
- **Redirect URLs:** `https://freshprice-eta.vercel.app/**` (add `http://localhost:3000/**` for local development)

## Supabase → Authentication → Email Templates

Point the email links at the app's `/auth/callback` with a `token_hash`. The app then verifies the link on the server, so it works in **any** browser, including a phone's email app.

**Confirm signup**, replace the link in the template body with:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>
```

**Reset Password**, replace the link with:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>
```

Leave the rest of each template (subject, wording) as you like. Links are single-use and expire (1 hour by default).
