import { sanitizeSupplierDescription } from '../../../src/supplier-content.js';

export async function sanitizeCatalogueResponse(response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) return response;

  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!Array.isArray(payload?.products)) return response;

  const headers = new Headers(response.headers);
  for (const header of ['content-length', 'content-encoding', 'content-md5', 'etag']) headers.delete(header);
  const products = payload.products.map((product) => (
    !product || !Object.hasOwn(product, 'desc')
      ? product
      : { ...product, desc: sanitizeSupplierDescription(product.desc) }
  ));
  return new Response(JSON.stringify({ ...payload, products }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function buildProductPage(assetResponse, requestUrl, product) {
  if (!product || assetResponse.status !== 200) return assetResponse;
  const contentType = assetResponse.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) return assetResponse;

  const url = new URL(requestUrl);
  const id = String(product.id);
  const canonical = `${url.origin}/product/${encodeURIComponent(id)}`;
  const name = String(product.name || 'Product');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const description = sanitizeSupplierDescription(product.desc)
    || `View current ${name} supplier listing.`;
  const title = escapeHtml(`${name} | SoftBazzar`);
  const safeDescription = escapeHtml(description);
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonical)}" data-canonical>`;
  const price = Number(product.priceInrPaise);
  const offer = Number.isSafeInteger(price) && price >= 0 ? {
    '@type': 'Offer',
    priceCurrency: 'INR',
    price: (price / 100).toFixed(2),
    availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
  } : undefined;
  const structured = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    category: product.cat || product.type,
    url: canonical,
    ...(offer ? { offers: offer } : {}),
  }).replace(/</g, '\\u003c');

  let html = await assetResponse.text();
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = html.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${safeDescription}">`);
  html = html.replace(/<link\s+rel="canonical"[^>]*>/i, canonicalTag);
  html = html.replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${title}">`);
  html = html.replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${safeDescription}">`);
  html = html.replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeHtml(canonical)}">`);
  html = html.replace(/<script\s+type="application\/ld\+json"[^>]*data-product-offer[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace('</head>', `<script type="application/ld+json" data-product-offer>${structured}</script></head>`);

  const headers = new Headers(assetResponse.headers);
  for (const header of ['content-length', 'content-encoding', 'content-md5', 'etag']) headers.delete(header);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(html, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}
