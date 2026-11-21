import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const origin = 'https://softbazzar.pages.dev';

async function rewriteHtml(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return rewriteHtml(target);
    if (entry.name !== 'index.html') return;
    const html = await readFile(target, 'utf8');
    const stagingHtml = html
      .replaceAll('https://softbazzar.vercel.app', origin)
      .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow" />');
    await writeFile(target, stagingHtml);
  }));
}

await rewriteHtml(dist);
await writeFile(path.join(dist, '_routes.json'), JSON.stringify({
  version: 1,
  include: ['/api/*', '/product/*'],
  exclude: [],
}, null, 2));
await writeFile(path.join(dist, '_headers'), `/*\n  X-Robots-Tag: noindex, nofollow\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com; img-src 'self' data: https:; media-src 'self' https://d8j0ntlcm91z4.cloudfront.net; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'\n`);
await writeFile(path.join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
await writeFile(path.join(dist, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
