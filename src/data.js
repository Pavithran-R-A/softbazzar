const favicon = (domain) => `<img src="https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128" style="width:100%;height:100%;object-fit:contain;border-radius:50%;background:#fff;padding:4px;box-sizing:border-box;" />`;

export const brandIcons = {
  chatgpt: favicon('chatgpt.com'),
  perplexity: favicon('perplexity.ai'),
  gemini: favicon('gemini.google.com'),
  envato: favicon('envato.com'),
  windsurf: favicon('windsurf.com'),
  microsoft: favicon('microsoft.com'),
  canva: favicon('canva.com'),
  grok: favicon('x.ai'),
  coursera: favicon('coursera.org'),
  capcut: favicon('capcut.com'),
  autodesk: favicon('autodesk.com'),
  windows: favicon('microsoft.com'),
  linkedin: favicon('linkedin.com'),
  replit: favicon('replit.com'),
  manus: favicon('manus.im'),
  notion: favicon('notion.so'),
  netflix: favicon('netflix.com'),
  cursor: favicon('cursor.com'),
  adobe: favicon('adobe.com'),
  figma: favicon('figma.com'),
  ilovepdf: favicon('ilovepdf.com'),
  quillbot: favicon('quillbot.com'),
  deepl: favicon('deepl.com'),
  elevenlabs: favicon('elevenlabs.io'),
  framer: favicon('framer.com'),
  lovable: favicon('lovable.dev'),
  supabase: favicon('supabase.com'),
  n8n: favicon('n8n.io'),
  warp: favicon('warp.dev'),
  railway: favicon('railway.com'),
  linear: favicon('linear.app'),
  gumloop: favicon('gumloop.com'),
  chatprd: favicon('chatprd.ai'),
  reclaim: favicon('reclaim.ai'),
  wisprflow: favicon('wisprflow.ai'),
  posthog: favicon('posthog.com'),
  factory: favicon('factory.ai'),
  granola: favicon('granola.ai'),
  gamma: favicon('gamma.app'),
  dreamina: favicon('dreamina.capcut.com'),
  magicpatterns: favicon('magicpatterns.com'),
  miro: favicon('miro.com'),
  mobbin: favicon('mobbin.com'),
  intercom: favicon('intercom.com'),
  freepik: favicon('freepik.com'),
};

export let products = [];
export let categories = ['All'];
export function setCatalogue(nextProducts) {
  products = nextProducts;
  const seen = new Set();
  categories = ['All', ...nextProducts.flatMap((product) => {
    const label = String(product.cat || '').trim();
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) return [];
    seen.add(key);
    return [label];
  })];
}
