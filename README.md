# SoftBazzar Storefront

The customer-facing storefront for SoftBazzar, a small digital-products catalogue. This repository is focused on the web experience: browsing products, filtering the catalogue, managing a local cart, reviewing policies, and handing a customer off to the configured support/checkout channel.

The code is intentionally lightweight. It uses Vite and plain JavaScript rather than a large frontend framework, with product and category data kept separately from the rendering code.

## What it includes

- searchable product catalogue and category filters
- product variants and stock/availability states
- cart state persisted in the browser
- checkout summary and support hand-off
- privacy and terms pages
- responsive storefront UI
- Vercel Analytics integration
- small asset-processing scripts used while maintaining the catalogue

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

Preview the generated build locally:

```bash
npm run preview
```

## Repository layout

```text
src/main.js       storefront behaviour and rendering
src/data.js       catalogue/category data
src/pages.js      static policy/support page content
src/index.css     visual system and responsive styles
public/           static assets
```

The repository also contains a few maintenance scripts for catalogue/assets. They are not required for normal storefront browsing.

## Scope

This repository contains the web storefront, not the full operational backend. Supplier synchronization, order processing and Telegram automation are maintained separately. Keeping those concerns separate makes the public-facing site easier to deploy and reason about.
