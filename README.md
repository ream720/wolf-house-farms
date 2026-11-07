# Wolf House Farms

A bilingual English/Spanish seed catalog built with Astro and TypeScript, with server-side order handling and an authenticated administration portal. Public catalog pages are prerendered; order APIs and administration run as Vercel functions.

## Local development

Use Node.js 22.19.0 or newer within the 22.x release line (`.nvmrc` pins the tested version, 22.23.4), and install the pinned dependencies:

```sh
npm ci
```

Copy `.env.example` to `.env` and supply the environment settings for your development backend. Keep `.env` local and never commit credentials.

```sh
npm run dev
```

## Verification

```sh
npm run check
npm test
npm run build
npm run verify:build
npm run audit:security
```

Build verification checks 67 public HTML pages, canonical and language URLs, sitemap coverage, crawler rules, local links and assets, upcoming-variety restrictions, and legacy redirects in the Vercel routing configuration. Live backend verification scripts are for isolated development environments only; they create temporary order and authentication fixtures.

The application uses Astro 7 and its Vercel adapter. Scoped dependency overrides keep the adapter's `glob` and `path-to-regexp` dependencies on patched releases until upstream updates those ranges. The security audit uses the official npm registry because some registry mirrors do not support the audit API. Commit `package-lock.json` with dependency changes and rerun these checks before deployment.

## Vercel deployment

Import this repository using the **Astro** preset with Node.js **22.x**. Use `npm ci` to install and `npm run build` to build. Keep the framework's default output settings: the Vercel adapter emits `.vercel/output` with both static pages and server functions. Publishing only `dist/client` would omit checkout and administration.

Configure these variables in the intended Vercel environment:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Backend project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Backend publishable key |
| `SUPABASE_SECRET_KEY` | Privileged server-only backend key |
| `ORDER_RATE_LIMIT_SECRET` | Stable random secret of at least 32 characters, unique per environment |
| `ORDERS_ENABLED` | Start with `false`; enable submissions after deployment testing |

Do not prefix privileged keys with `PUBLIC_`. Use a separate backend for independent test orders. Verify administrator login over HTTPS before enabling orders.

The production domain is `https://wolfhousegenetics.com`; `www` redirects to it in Vercel. `src/data/site.ts` supplies the canonical origin. Public content is open to indexing, with absolute English/Spanish alternate URLs and a generated `/sitemap.xml` advertised in `/robots.txt`. Checkout, confirmation, 404, admin and API responses remain excluded from indexing. Admin authentication continues to enforce access separately from crawler rules.

A new backend requires the schema and administrator membership to be configured separately. Do not reapply `supabase/schema.sql` to an already configured backend.

## Current behavior

- English and Spanish catalogs, variety pages, search and collection filters.
- Winter is coming leads the catalog with five Caviar crosses marked Coming soon; the existing 18 varieties remain available.
- Adult entry and policy acknowledgement, shared cart and server-validated checkout.
- Durable order storage, retry protection and saved original order details.
- Approved-user administration for order edits, fulfillment, tracking, packing slips and change history.

Payment collection and customer communication are manual. The site does not process payments or automatically send invoices or customer emails. Seed availability is configured in source. Plantz pollen is a separate limited offer: four 2 mL units at $200 USD each. Its live stock is held atomically when an order is saved, including unpaid reservations; cancellation, removal, and quantity reductions release stock. Administrators must cancel abandoned pollen reservations to release them. Fulfilled orders continue to count against the release quantity.

Checkout offers Cash App, Apple Pay, and cash by mail. The Cash App destination is `$Wolfhousegenetics`; the Apple Pay phone is `209-404-9891`. Mailed cash uses Wolf House Genetics, 1700 McHenry Ave Ste 65B PMB166, Modesto, CA 95350. The app collects the customer's payment contact for digital methods; cash requires no payment-app account. Earlier PayPal and Zelle orders retain their original method and can still be managed.

The existing WHF database has the `allow_cash_by_mail_payment` migration applied. For another existing database, apply `supabase/enable-cash-by-mail.sql` before enabling cash (do not reapply the bootstrap schema). Public payment destinations are maintained in `src/data/payments.ts`. If the mailing address is cleared or incomplete, new cash reservations are blocked automatically.

US shipping offers standard service at $10 or expedited service at $30 total per order. Checkout calculates the selected rate on the server and preserves it on receipts and existing admin orders. No delivery time is promised.

The existing WHF database has the `limited_pollen_inventory` migration applied. For another existing backend, apply `supabase/migrations/20261107031809_limited_pollen_inventory.sql` once. Do not reapply `supabase/schema.sql`. New backends use the updated bootstrap schema. The stock table is server-only; `/api/inventory/` exposes only the remaining pollen quantity. `supabase/verify-pollen.sql` verifies allocation, retries, edits, cancellation and sold-out rejection using fixtures that are rolled back.

## Content and assets

- `src/data/catalog.ts`: varieties, lineage, availability and offers.
- `src/i18n/index.ts`: English and Spanish copy.
- `src/data/contact.ts`: public contact details.
- `src/data/policies.ts`: policy wording and versions.
- `src/styles/`: branding and responsive styling.
- `public/images/`: optimized images included in deployments.

Internal planning documents, client reference screenshots and original artwork remain local and are excluded from this public repository. Normal builds use the committed optimized images. The optional `npm run assets:optimize` command requires the original artwork under the local `assets/artwork/` directory.
