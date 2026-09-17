import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from '../src/data.js';
import { privacyPage, termsPage } from '../src/pages.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const origin = 'https://softbazzar.vercel.app';
const baseHtml = await readFile(path.join(dist, 'index.html'), 'utf8');

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function replaceMeta(html, { title, description, url, robots = 'index, follow', type = 'website', jsonLd }) {
  let next = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${robots}" />`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" data-canonical />`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(title)}" data-og-title />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(description)}" data-og-description />`)
    .replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="${type}" />`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" data-og-url />`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeHtml(title)}" data-twitter-title />`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeHtml(description)}" data-twitter-description />`);
  if (jsonLd) next = next.replace('</head>', `    <script type="application/ld+json">${safeJson(jsonLd)}</script>\n  </head>`);
  return next;
}

function replaceFallback(html, content) {
  return html.replace(/<div id="app">[\s\S]*?<\/div>/, `<div id="app">${content}</div>`);
}

async function writeRoute(route, html) {
  const directory = route === '/' ? dist : path.join(dist, route.replace(/^\//, ''));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), html);
}

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'SoftBazzar',
  url: `${origin}/`,
  description: 'Premium digital tools and subscription catalogue with Telegram-assisted ordering.',
};

let home = replaceMeta(baseHtml, {
  title: 'SoftBazzar — Premium AI Tools & Digital Subscriptions',
  description: "Browse SoftBazzar's premium tools and digital subscriptions, compare MRP with current sale prices, and continue ordering through Telegram.",
  url: `${origin}/`,
  jsonLd: websiteLd,
});
home = replaceFallback(home, '<main><h1>SoftBazzar</h1><p>Premium tools and digital subscriptions at lower prices. Compare current sale prices and available plans.</p></main>');
await writeRoute('/', home);

const legalRoutes = [
  { route: '/privacy', title: 'Privacy Policy | SoftBazzar', description: 'Read how SoftBazzar handles browser cart storage, order information, analytics and support communications.', content: privacyPage() },
  { route: '/terms', title: 'Terms & Conditions | SoftBazzar', description: 'Read SoftBazzar terms covering digital products, ordering, payment, delivery, refunds and customer responsibilities.', content: termsPage() },
];
for (const page of legalRoutes) {
  const url = `${origin}${page.route}`;
  let html = replaceMeta(baseHtml, {
    title: page.title,
    description: page.description,
    url,
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, url, description: page.description, isPartOf: { '@id': `${origin}/#website` } },
  });
  html = replaceFallback(html, page.content);
  await writeRoute(page.route, html);
}

for (const product of products.filter((entry) => entry.inStock !== false)) {
  const activeVariants = Array.isArray(product.variants) ? product.variants.filter((variant) => !variant.disabled) : [];
  const offers = (activeVariants.length ? activeVariants : [product])
    .map((offer) => {
      const price = Number(offer.priceNum);
      if (!Number.isFinite(price)) return null;
      return {
        '@type': 'Offer',
        priceCurrency: 'INR',
        price,
        availability: 'https://schema.org/InStock',
        url: `${origin}/product/${encodeURIComponent(product.id)}`,
        ...(offer.name && offer !== product ? { name: offer.name } : {}),
      };
    })
    .filter(Boolean);

  const route = `/product/${encodeURIComponent(product.id)}`;
  const url = `${origin}${route}`;
  const title = `${product.name} | SoftBazzar`;
  const description = String(product.desc || `View current ${product.name} options and pricing at SoftBazzar.`).slice(0, 155);

  let structuredOffers;
  if (offers.length === 1) {
    structuredOffers = offers[0];
  } else if (offers.length > 1) {
    const prices = offers.map((offer) => offer.price);
    structuredOffers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: offers.length,
      offers,
    };
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    category: product.cat,
    url,
    ...(structuredOffers ? { offers: structuredOffers } : {}),
  };

  const first = activeVariants[0] ?? product;
  let html = replaceMeta(baseHtml, { title, description, url, type: 'product', jsonLd });
  html = replaceFallback(
    html,
    `<main><p>${escapeHtml(product.cat)}</p><h1>${escapeHtml(product.name)}</h1><p>${escapeHtml(product.desc || '')}</p><p>Current option from ${escapeHtml(first.price || product.price || '')}${first.mrp ? ` (MRP ${escapeHtml(first.mrp)})` : ''}.</p><p><a href="/">Back to SoftBazzar catalogue</a></p></main>`,
  );
  await writeRoute(route, html);
}

let checkout = replaceMeta(baseHtml, {
  title: 'Checkout | SoftBazzar',
  description: 'Review the products saved in your SoftBazzar cart and continue the order through Telegram.',
  url: `${origin}/checkout`,
  robots: 'noindex, nofollow',
});
checkout = replaceFallback(checkout, '<main><h1>Checkout</h1><p>Your cart is stored locally in this browser. Open the interactive site to review current catalogue-derived totals and continue the order on Telegram.</p></main>');
await writeRoute('/checkout', checkout);

const publicUrls = ['/', '/privacy', '/terms', ...products.filter((entry) => entry.inStock !== false).map((entry) => `/product/${encodeURIComponent(entry.id)}`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/sitemap/0.9">\n${publicUrls.map((route) => `  <url><loc>${origin}${route}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(path.join(dist, 'sitemap.xml'), sitemap);
await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
