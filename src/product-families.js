const FAMILY_RULES = [
  { slug: 'chatgpt', name: 'ChatGPT', icon: 'chatgpt', pattern: /\bchat\s*gpt\b|\bopenai\b/i },
  { slug: 'gemini', name: 'Gemini', icon: 'gemini', pattern: /\bgemini\b/i },
  { slug: 'claude', name: 'Claude', icon: 'claude', pattern: /\bclaude\b/i },
  { slug: 'canva', name: 'Canva', icon: 'canva', pattern: /\bcanva\b/i },
  { slug: 'adobe', name: 'Adobe', icon: 'adobe', pattern: /\badobe\b|\bphotoshop\b|\bpremiere\b/i },
  { slug: 'capcut', name: 'CapCut', icon: 'capcut', pattern: /\bcap\s*cut\b/i },
  { slug: 'elevenlabs', name: 'ElevenLabs', icon: 'elevenlabs', pattern: /\beleven\s*labs\b|\belevenlabs\b/i },
  { slug: 'microsoft', name: 'Microsoft', icon: 'microsoft', pattern: /\bmicrosoft\b|\boffice\s*365\b|\bwindows\b/i },
  { slug: 'figma', name: 'Figma', icon: 'figma', pattern: /\bfigma\b/i },
  { slug: 'netflix', name: 'Netflix', icon: 'netflix', pattern: /\bnetflix\b/i },
  { slug: 'notion', name: 'Notion', icon: 'notion', pattern: /\bnotion\b/i },
  { slug: 'envato', name: 'Envato', icon: 'envato', pattern: /\benvato\b/i },
  { slug: 'coursera', name: 'Coursera', icon: 'coursera', pattern: /\bcoursera\b/i },
  { slug: 'apple-music', name: 'Apple Music', icon: 'apple-music', pattern: /\bapple\s*music\b/i },
  { slug: 'amazon-prime', name: 'Amazon Prime Video', icon: 'amazon-prime', pattern: /\bamazon\s*prime(?:\s*video)?\b/i },
  { slug: 'spotify', name: 'Spotify', icon: 'spotify', pattern: /\bspotify\b/i },
  { slug: 'perplexity', name: 'Perplexity', icon: 'perplexity', pattern: /\bperplexity\b/i },
  { slug: 'cursor', name: 'Cursor', icon: 'cursor', pattern: /\bcursor\b/i },
  { slug: 'grok', name: 'Grok', icon: 'grok', pattern: /\bgrok\b/i },
];

const MERCHANDISING_ORDER = FAMILY_RULES.map(({ slug }) => slug);

function standaloneSlug(id) {
  const bytes = new TextEncoder().encode(String(id));
  return `offer-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('') || 'empty'}`;
}

function sellablePrices(product) {
  if (Array.isArray(product.variants) && product.variants.length) {
    return product.variants
      .filter((variant) => !variant.disabled && variant.inStock !== false)
      .map((variant) => Number(variant.priceInrPaise))
      .filter(Number.isSafeInteger);
  }
  return product.inStock === false ? [] : [Number(product.priceInrPaise)].filter(Number.isSafeInteger);
}

export function deriveProductFamilies(products) {
  const grouped = new Map();
  for (const product of products) {
    const matches = FAMILY_RULES.filter((rule) => rule.pattern.test(product.name));
    const rule = matches.length === 1 ? matches[0] : null;
    const family = rule ?? { slug: standaloneSlug(product.id), name: product.name, icon: product.icon, standalone: true };
    const current = grouped.get(family.slug) ?? { ...family, products: [] };
    current.products.push(product);
    grouped.set(family.slug, current);
  }
  return [...grouped.values()].map((family) => {
    const offers = [...family.products].sort((left, right) => Number(left.priceInrPaise) - Number(right.priceInrPaise));
    const availableOffers = offers.filter((product) => product.inStock);
    const availablePrices = offers.flatMap(sellablePrices);
    return {
      ...family,
      products: offers,
      availableOffers: availableOffers.length,
      startingPricePaise: availablePrices.length ? Math.min(...availablePrices) : null,
      featuredRank: MERCHANDISING_ORDER.indexOf(family.slug),
    };
  }).sort((left, right) => {
    const leftRank = left.featuredRank < 0 ? Infinity : left.featuredRank;
    const rightRank = right.featuredRank < 0 ? Infinity : right.featuredRank;
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });
}

export function featuredProductFamilies(families, limit = 18) {
  return families.filter((family) => family.featuredRank >= 0).slice(0, Math.min(24, Math.max(12, limit)));
}

export function findProductFamily(families, slug) {
  return families.find((family) => family.slug === slug) ?? null;
}
