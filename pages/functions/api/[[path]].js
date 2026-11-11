export function onRequest({ request, env }) {
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

  return env.SOFTBAZZAR_API.fetch(request);
}
