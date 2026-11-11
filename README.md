# SoftBazzar Storefront

The SoftBazzar storefront and Cloudflare Worker backend. Supplier inventory is the only active catalogue source. Checkout stays disabled until payment and fulfilment reviews finish.

The code uses Vite and plain JavaScript. Runtime products come from the Worker API.

## What it includes

- searchable product catalogue and category filters
- validated supplier stock and availability
- cart state persisted in the browser
- D1 catalogue, sync history, fixed pricing, and orders
- two-minute supplier synchronization Worker
- Fixed 1 USD to ₹105 merchant conversion
- 25% markup on authenticated supplier `your_cost`
- privacy and terms pages
- responsive storefront UI
- explicitly labelled development fixture inventory

## Development

Install dependencies and start Vite:

```bash
npm install
npm run dev
```

Build the production site with:

```bash
npm run build
```

Run locally with Cloudflare bindings:

```bash
npm run cf:dev
```

Before staging, create D1 and set `database_id`.
Apply local migrations with `wrangler d1 migrations apply softbazzar --local`.
Set secrets with `wrangler secret put AITOOLSHOP_API_KEY` and
`wrangler secret put ADMIN_TOKEN`. Never commit secret values.
Pricing assumes 1 USDT is approximately 1 USD.
The backend applies exactly 25% markup.
Admin rate changes require a reason.
Authorized rate changes receive immutable audit records.

For isolated staging, create `softbazzar-staging` D1.
Set its identifier under `env.staging.d1_databases`.
Apply staging migrations before deploying the Worker.
Add secrets with `wrangler secret put AITOOLSHOP_API_KEY --env staging`.
Keep the supplier secret unset until owner configuration.
Add `ADMIN_TOKEN` only through Wrangler secrets.
Keep YouPI credentials unset during this review.
Deploy staging with `wrangler deploy --env staging`.
Staging keeps payments and purchases disabled.
Never use the production deploy command here.

For rollback, inspect `wrangler deployments list --env staging`.
Then select the verified prior staging version.
Keep the production domain unchanged throughout staging.

Preview the generated build locally:

```bash
npm run preview
```

## Repository layout

```text
src/main.js       storefront behaviour and rendering
src/data.js       brand icons and empty product seed
src/worker.js     Cloudflare API and scheduled sync
src/supplier.js   validated reseller API client
src/pricing.js    fixed markup and decimal-safe conversions
migrations/       versioned D1 schema
src/pages.js      static policy/support page content
src/index.css     visual system and responsive styles
public/           static assets
```

Existing catalogue records remain recoverable through Git history.
Do not enable live payment or supplier purchase flags.
The fixture in `fixtures/catalogue.dev.json` is never loaded in production.
