const monogram = (letters) => `<span class="brand-monogram" aria-hidden="true">${letters}</span>`;

export const brandIcons = {
  chatgpt: monogram('CG'), perplexity: monogram('P'), gemini: monogram('G'),
  envato: monogram('E'), windsurf: monogram('W'), microsoft: monogram('M'),
  canva: monogram('C'), grok: monogram('G'), coursera: monogram('Co'),
  capcut: monogram('CC'), autodesk: monogram('A'), windows: monogram('W'),
  linkedin: monogram('in'), replit: monogram('R'), manus: monogram('M'),
  notion: monogram('N'), netflix: monogram('N'), cursor: monogram('Cu'),
  adobe: monogram('A'), figma: monogram('F'), ilovepdf: monogram('PDF'),
  quillbot: monogram('Q'), deepl: monogram('D'), elevenlabs: monogram('11'),
  framer: monogram('Fr'), lovable: monogram('L'), supabase: monogram('S'),
  n8n: monogram('n8'), warp: monogram('W'), railway: monogram('R'),
  linear: monogram('L'), gumloop: monogram('G'), chatprd: monogram('CP'),
  reclaim: monogram('Re'), wisprflow: monogram('W'), posthog: monogram('PH'),
  factory: monogram('F'), granola: monogram('G'), gamma: monogram('Ga'),
  dreamina: monogram('D'), magicpatterns: monogram('MP'), miro: monogram('Mi'),
  mobbin: monogram('Mo'), intercom: monogram('I'), freepik: monogram('FP'),
  claude: monogram('Cl'), 'apple-music': monogram('AM'), 'amazon-prime': monogram('P'), spotify: monogram('S'),
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
