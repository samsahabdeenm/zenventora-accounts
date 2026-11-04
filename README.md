# ZenVentora Accounts

Central identity and account experience for ZenVentora products.

## Products
- ZenVentora account portal
- eMenu
- SiteRadar
- Site Visual Editor

## Architecture
- React + Vite frontend
- Supabase Auth for central identity
- Express API for OTP verification and account operations
- Resend for transactional verification and password-reset emails

## Local development
```bash
npm install
npm run dev
```

The API is in `server/`:
```bash
cd server
npm install
npm start
```

## Frontend environment
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ACCOUNTS_API_URL`
- `VITE_EMENU_SSO_CALLBACK` (optional exact HTTPS callback URL)
- `VITE_SITERADAR_SSO_CALLBACK` (optional exact HTTPS callback URL)
- `VITE_VISUAL_EDITOR_SSO_CALLBACK` (exact HTTPS callback URL)
- `VITE_EMENU_APP_URL`
- `VITE_SITERADAR_APP_URL`
- `VITE_VISUAL_EDITOR_APP_URL`

Product callback URLs must be configured for each product. The account app accepts only the exact callback configured for the selected product. Each product callback handler must validate the central session server-side and enforce product entitlement from server-controlled app metadata before creating a product session.

Common login: `/login` or `/`. Common signup: `/signup`. Product login entries use `?product=emenu`, `?product=siteradar`, or `?product=visual-editor`.

## Server environment
See `server/.env.example`. Never expose the Supabase service-role key or OTP pepper to the browser.

## Production note
Product entitlement enforcement must use server-controlled database records or Supabase app metadata. User-editable profile metadata must not be treated as authorization.
