// Customer-facing discovery only. Supplier IDs, offers and checkout data remain authoritative.
const BUNDLE_RULES = [
  { slug: 'grok-cursor', name: 'Grok + Cursor', icon: 'grok', category: 'AI', pattern: /\bgrok\s*\+\s*cursor\b/i },
  { slug: 'coursera-gemini', name: 'Coursera + Gemini', icon: 'coursera', category: 'Learning', pattern: /\bcoursera\b[\s\S]{0,40}\bgemini\b/i },
];

const FAMILY_RULES = [
  { slug: "chatgpt", name: "ChatGPT", icon: "chatgpt", category: "AI", pattern: /\bchat\s*gpt\b|\bopenai\b/i },
  { slug: "gemini", name: "Gemini", icon: "gemini", category: "AI", pattern: /\bgemini\b|\bgoogle\s+ai\b/i },
  { slug: "claude", name: "Claude", icon: "claude", category: "AI", pattern: /\bclaude\b/i },
  { slug: "elevenlabs", name: "ElevenLabs", icon: "elevenlabs", category: "AI", pattern: /\beleven\s*labs?\b|\beleven\s*reader\b/i },
  { slug: "canva", name: "Canva", icon: "canva", category: "Design", pattern: /\bcanva\b/i },
  { slug: "capcut", name: "CapCut", icon: "capcut", category: "Design", pattern: /\bcap\s*cut\b/i },
  { slug: "adobe", name: "Adobe", icon: "adobe", category: "Design", pattern: /\badobe\b|\bphotoshop\b|\bpremiere\b/i },
  { slug: "figma", name: "Figma", icon: "figma", category: "Design", pattern: /\bfigma\b/i },
  { slug: "microsoft", name: "Microsoft 365 & Office", icon: "microsoft", category: "Productivity", pattern: /\bmicrosoft\b|\bms\s*365\b|\boffice\s*(?:365|20\d\d)\b/i },
  { slug: "spotify", name: "Spotify", icon: "spotify", category: "Entertainment", pattern: /\bspotify\b/i },
  { slug: "youtube", name: "YouTube", icon: "youtube", category: "Entertainment", pattern: /\byou\s*tube\b/i },
  { slug: "netflix", name: "Netflix", icon: "netflix", category: "Entertainment", pattern: /\bnetflix\b/i },
  { slug: "prime-video", name: "Prime Video", icon: "amazon-prime", category: "Entertainment", pattern: /\b(?:amazon\s*)?prime\s*video\b/i },
  { slug: "notion", name: "Notion", icon: "notion", category: "Productivity", pattern: /\bnotion\b/i },
  { slug: "perplexity", name: "Perplexity", icon: "perplexity", category: "AI", pattern: /\bperplexity\b/i },
  { slug: "cursor", name: "Cursor", icon: "cursor", category: "Developer", pattern: /\bcursor\b/i },
  { slug: "grok", name: "Grok", icon: "grok", category: "AI", pattern: /\bgrok\b/i },
  { slug: "codex", name: "Codex", icon: "codex", category: "Developer", pattern: /\bcodex\b/i },
  { slug: "coursera", name: "Coursera", icon: "coursera", category: "Learning", pattern: /\bcoursera\b/i },
  { slug: "udemy", name: "Udemy", icon: "udemy", category: "Learning", pattern: /\budemy\b/i },
  { slug: "duolingo", name: "Duolingo", icon: "duolingo", category: "Learning", pattern: /\bduo\s*lingo\b/i },
  { slug: "edx", name: "edX", icon: "edx", category: "Learning", pattern: /\bedx\b/i },
  { slug: "github", name: "GitHub", icon: "github", category: "Developer", pattern: /\bgithub\b/i },
  { slug: "gmail", name: "Gmail", icon: "gmail", category: "Productivity", pattern: /\bgmail\b/i },
  { slug: "outlook", name: "Outlook", icon: "outlook", category: "Productivity", pattern: /\boutlook\b/i },
  { slug: "windows", name: "Windows", icon: "windows", category: "Productivity", pattern: /\bwindows\b/i },
  { slug: "nordvpn", name: "NordVPN", icon: "nordvpn", category: "Security", pattern: /\bnord\s*vpn\b/i },
  { slug: "surfshark", name: "Surfshark", icon: "surfshark", category: "Security", pattern: /\bsurf\s*shark\b/i },
  { slug: "mcafee", name: "McAfee", icon: "mcafee", category: "Security", pattern: /\bmcafee\b/i },
  { slug: "apple-music", name: "Apple Music", icon: "apple-music", category: "Entertainment", pattern: /\bapple\s*music\b/i },
  { slug: "apple-tv", name: "Apple TV", icon: "apple-tv", category: "Entertainment", pattern: /\bapple\s*t[vv]\b/i },
  { slug: "crunchyroll", name: "Crunchyroll", icon: "crunchyroll", category: "Entertainment", pattern: /\bcrunchy\s*roll\b/i },
  { slug: "discord", name: "Discord", icon: "discord", category: "Entertainment", pattern: /\bdiscord\b|\bnitro\b/i },
  { slug: "iqiyi", name: "iQIYI", icon: "iqiyi", category: "Entertainment", pattern: /\biqiyi\b/i },
  { slug: "tiktok", name: "TikTok", icon: "tiktok", category: "Entertainment", pattern: /\btik\s*tok\b/i },
  { slug: "zoom", name: "Zoom", icon: "zoom", category: "Productivity", pattern: /\bzoom\b/i },
  { slug: "grammarly", name: "Grammarly", icon: "grammarly", category: "Productivity", pattern: /\bgrammarly\b/i },
  { slug: "quillbot", name: "QuillBot", icon: "quillbot", category: "Productivity", pattern: /\bquill\s*bot\b/i },
  { slug: "ilovepdf", name: "iLovePDF", icon: "ilovepdf", category: "Productivity", pattern: /\bilove\s*pdf\b/i },
  { slug: "wisprflow", name: "Wispr Flow", icon: "wisprflow", category: "AI", pattern: /\bwispr\s*flow\b/i },
  { slug: "lovable", name: "Lovable", icon: "lovable", category: "Developer", pattern: /\blovable\b/i },
  { slug: "muse", name: "Muse AI", icon: "muse", category: "AI", pattern: /\bmuse\b/i },
  { slug: "meitu", name: "Meitu", icon: "meitu", category: "Design", pattern: /\bmeitu\b/i },
  { slug: "openart", name: "OpenArt", icon: "openart", category: "Design", pattern: /\bopenart\b/i },
  { slug: "kling", name: "Kling", icon: "kling", category: "AI", pattern: /\bkling\b/i },
  { slug: "veo", name: "Veo", icon: "veo", category: "AI", pattern: /\bveo\s*3?\b/i },
  { slug: "coreldraw", name: "CorelDRAW", icon: "coreldraw", category: "Design", pattern: /\bcorel\s*draw\b/i },
  { slug: "autodesk", name: "Autodesk", icon: "autodesk", category: "Design", pattern: /\bautodesk\b/i },
  { slug: "envato", name: "Envato", icon: "envato", category: "Design", pattern: /\benvato\b/i },
  { slug: "linkedin", name: "LinkedIn", icon: "linkedin", category: "Productivity", pattern: /\blinked\s*in\b|\blinkdin\b/i },
  { slug: "granola", name: "Granola", icon: "granola", category: "AI", pattern: /\bgranola\b/i },
  { slug: "brainfm", name: "Brain.fm", icon: "brainfm", category: "Productivity", pattern: /\bbrain\s*fm\b/i },
  { slug: "max", name: "Max", icon: "max", category: "Entertainment", pattern: /\bmax\s+plan\b/i },
  { slug: "hma", name: "HMA VPN", icon: "hma", category: "Security", pattern: /\bhma\s*vpn\b/i },
  { slug: "tv360", name: "TV360", icon: "tv360", category: "Entertainment", pattern: /\btv360\b/i },
];

const MERCHANDISING_ORDER = [...BUNDLE_RULES, ...FAMILY_RULES].map(({ slug }) => slug);

function standaloneSlug(id) {
  const bytes = new TextEncoder().encode(String(id));
  return `offer-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('') || 'empty'}`;
}

export function inferFamilyIdentity(name) {
  const title = String(name || '').normalize('NFKC');
  const explicit = BUNDLE_RULES.find(({ pattern }) => pattern.test(title));
  if (explicit) return explicit;
  // The first mentioned product is the primary family for multi-brand bundles.
  const matches = FAMILY_RULES.map((rule) => ({ rule, index: title.search(rule.pattern) }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index || FAMILY_RULES.indexOf(left.rule) - FAMILY_RULES.indexOf(right.rule));
  return matches[0]?.rule ?? null;
}

export function roundedCatalogueRupees(paise) {
  if (!Number.isSafeInteger(paise) || paise < 0) return null;
  return Math.ceil(paise / 100);
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
    const rule = inferFamilyIdentity(product.name);
    const family = rule ?? {
      slug: standaloneSlug(product.id),
      name: product.name,
      icon: product.icon,
      category: /\b(?:collection|templates?|graphics|digital\s*products)\b/i.test(product.name) ? 'Collections' : 'Other',
      standalone: true,
    };
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
    return leftRank - rightRank || left.name.localeCompare(right.name, 'en-US') || left.slug.localeCompare(right.slug, 'en-US');
  });
}

export function featuredProductFamilies(families, limit = 18) {
  return families.filter((family) => family.featuredRank >= 0 && family.availableOffers > 0)
    .slice(0, Math.min(24, Math.max(12, limit)));
}

function normalizedOfferName(product) {
  return String(product.name || '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

function editorialRank(product) {
  const identity = inferFamilyIdentity(product.name);
  return identity ? MERCHANDISING_ORDER.indexOf(identity.slug) : -1;
}

// Retained for legacy offer detail recommendations and existing tests.
export function editorialProductOrder(products) {
  return [...products].sort((left, right) => {
    const leftRank = editorialRank(left);
    const rightRank = editorialRank(right);
    if (leftRank >= 0 || rightRank >= 0) {
      if (leftRank < 0) return 1;
      if (rightRank < 0) return -1;
      if (leftRank !== rightRank) return leftRank - rightRank;
    }
    const nameDelta = normalizedOfferName(left).localeCompare(normalizedOfferName(right), 'en-US');
    return nameDelta || String(left.id).localeCompare(String(right.id), 'en-US');
  });
}

export function findProductFamily(families, slug) {
  return families.find((family) => family.slug === slug) ?? null;
}
