# ZenVentora Accounts — Integration Contract

This is the central identity provider for the ZenVentora website and connected products. Keep the website and product-specific signup pages as entry points only; account creation, verification and credentials remain centralized here.

## Website: zenventora.in

Use these destinations for the primary actions:

- Sign up: `https://accounts.zenventora.in/?mode=signup`
- Sign in: `https://accounts.zenventora.in/?mode=signin`

To determine whether a visitor already has an authenticated account, load a hidden same-site iframe:

```html
<iframe
  title="ZenVentora account status"
  src="https://accounts.zenventora.in/?auth_status=1&parent_origin=https%3A%2F%2Fzenventora.in"
  hidden
></iframe>
```

Listen for a `message` from the exact Accounts origin and verify both `event.origin === "https://accounts.zenventora.in"` and `event.data.type === "ZENVENTORA_AUTH_STATUS"`. The message contains `authenticated`, `fullName`, `email`, and `parentOrigin`. Render the profile card only when `authenticated === true`; otherwise render Sign in / Sign up.

To sign out from the website, load a hidden iframe with:

`https://accounts.zenventora.in/?auth_action=signout&parent_origin=https%3A%2F%2Fzenventora.in`

The Accounts app ends its session, signals connected product tabs with the `.zenventora.in` logout cookie, and posts the signed-out status to the parent.

Allowed parent origins are intentionally restricted to:
- `https://zenventora.in`
- `https://www.zenventora.in`
- `https://emenu.zenventora.in`
- `https://siteradar.zenventora.in`
- `https://editor.zenventora.in`

## Product signup and sign-in

Product apps must redirect to Accounts. Do not create a separate credential store or call Supabase signup directly from a product.

| Product | Product slug | Exact callback URL |
|---|---|---|
| eMenu | `emenu` | `https://emenu.zenventora.in/auth/callback` |
| SiteRadar | `siteradar` | `https://siteradar.zenventora.in/auth/callback?next=/setup` |
| Site Visual Editor | `visual-editor` | `https://editor.zenventora.in/` |

Example signup URL (replace the callback only with the exact configured value):

`https://accounts.zenventora.in/?product=emenu&mode=signup&redirect_to=https%3A%2F%2Femenu.zenventora.in%2Fauth%2Fcallback`

For SiteRadar, preserve the selected edition using the `state` query parameter. Accounts returns it as `account_state` in the callback fragment.

The `redirect_to` value is accepted only when it exactly matches the corresponding server-configured callback. Never accept a user-supplied arbitrary redirect.

## Account signup API

- General account signup: `POST /api/auth/signup`
- Product signup: `POST /api/auth/product-signup`
- Verify email: `POST /api/auth/verify-email`
- Resend OTP: `POST /api/auth/resend-verification`
- Product token verification: `POST /api/sso/verify`

Product signup accepts only `emenu`, `siteradar`, and `visual-editor`. It records product entitlements in server-managed Supabase `app_metadata.product_access`, sends a one-time email code, and does not grant a product session until email verification succeeds.

## SSO callback contract

After successful sign-in, Accounts redirects to the exact callback URL with these values in the URL fragment (not the query string):

- `account_access_token`
- `account_refresh_token`
- `account_state` (optional)

The receiving product must immediately remove the fragment from browser history, establish its local application session, and then navigate to its authenticated start page. Never log or persist the raw callback URL.

- eMenu exchanges the central access token server-to-server at Accounts `/api/sso/verify`, checks that `product_access` contains `emenu`, and creates an eMenu-local HTTP-only cookie session.
- SiteRadar and Site Visual Editor use `supabase.auth.setSession({ access_token, refresh_token })`. Their `VITE_SUPABASE_URL` and publishable key must point to the same Supabase project as Accounts so the central session is recognized by their RLS policies.

## Required deployment configuration

### Accounts frontend
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ACCOUNTS_API_URL`
- `VITE_EMENU_SSO_CALLBACK`
- `VITE_SITERADAR_SSO_CALLBACK`
- `VITE_VISUAL_EDITOR_SSO_CALLBACK`
- `VITE_EMENU_APP_URL`
- `VITE_SITERADAR_APP_URL`
- `VITE_VISUAL_EDITOR_APP_URL`

### Accounts API (server)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `SUPABASE_ANON_KEY` (server-side user session issuance; never expose service-role key)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `OTP_PEPPER`
- `FRONTEND_ORIGIN`

### Product apps
- SiteRadar: `VITE_ZENVENTORA_ACCOUNTS_URL`, `VITE_APP_URL`, and the same Supabase project settings as Accounts.
- Site Visual Editor: `VITE_ZENVENTORA_ACCOUNTS_URL`, `VITE_APP_URL`, and the same Supabase project settings as Accounts.
- eMenu server: `ZENVENTORA_ACCOUNTS_API_URL`; client: `VITE_ZENVENTORA_ACCOUNTS_URL`.

## Session and responsive behavior

- Accounts persists the Supabase session and restores it on reload.
- SiteRadar and Visual Editor validate an active session on focus/visibility and periodically; expired sessions are cleared.
- eMenu validates `/api/auth/me`, uses its refresh-cookie flow, and polls for central sign-out.
- A non-secret `zv_central_logout` cookie on `.zenventora.in` signals already-open product tabs. It is a logout signal only, never an authentication credential.
- Auth pages and the signed-in account dashboard are responsive down to narrow mobile widths; product UIs retain their own responsive layouts.

## Readiness checklist

Before calling the system production-ready, configure the deployment variables above, ensure the Supabase Auth redirect allowlist contains the required callback URLs, run the CI build for each repository, and test signup → OTP → callback → reload/session restore → cross-product logout on desktop, tablet and mobile.
