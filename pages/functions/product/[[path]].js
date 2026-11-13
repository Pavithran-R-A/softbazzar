import { buildProductPage } from '../_shared/catalogue.js';

export function onRequest(context) {
  return serveProductPage(context);
}

async function serveProductPage({ request, env, next }) {
  const assetResponse = await next();
  if (request.method !== 'GET' || !env.SOFTBAZZAR_API) return assetResponse;

  const url = new URL(request.url);
  const encodedId = url.pathname.match(/^\/product\/([^/]+)\/?$/)?.[1];
  if (!encodedId) return assetResponse;

  let productId;
  try {
    productId = decodeURIComponent(encodedId);
  } catch {
    return assetResponse;
  }

  const catalogueUrl = new URL('/api/catalogue', url);
  const catalogueResponse = await env.SOFTBAZZAR_API.fetch(new Request(catalogueUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  }));
  if (!catalogueResponse.ok) return assetResponse;

  let catalogue;
  try {
    catalogue = await catalogueResponse.json();
  } catch {
    return assetResponse;
  }
  const product = Array.isArray(catalogue?.products)
    ? catalogue.products.find((item) => String(item.id) === productId)
    : null;
  return buildProductPage(assetResponse, request.url, product);
}

export { serveProductPage };
