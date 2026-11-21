import { sanitizeCatalogueResponse } from '../_shared/catalogue.js';

export async function onRequest({ request, env }) {
  if (!env.SOFTBAZZAR_API) {
    return new Response(JSON.stringify({ error: 'api_unavailable' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  const url = new URL(request.url);
  const isPublicCatalogue = request.method === 'GET' && url.pathname === '/api/catalogue';
  if (!isPublicCatalogue) return env.SOFTBAZZAR_API.fetch(request);

  const response = await env.SOFTBAZZAR_API.fetch(request);
  return sanitizeCatalogueResponse(response);
}
