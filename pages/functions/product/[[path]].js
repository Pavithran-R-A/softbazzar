export function onRequest({ request, env }) {
  if (!env.SOFTBAZZAR_API) {
    return new Response('Product service unavailable', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  return env.SOFTBAZZAR_API.fetch(request);
}
