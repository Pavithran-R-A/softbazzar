import { inferFamilyIdentity } from './product-families.js';

// Local marks avoid broken external logo requests.
function monogram(letters) {
  return `<span class="brand-monogram" aria-hidden="true">${letters}</span>`;
}

function brandMark(_iconSlug, letters) {
  return monogram(letters);
}

export const brandIcons = {
  "chatgpt": brandMark("openai", "CG"),
  "gemini": brandMark("googlegemini", "G"),
  "claude": brandMark("claude", "Cl"),
  "elevenlabs": brandMark("elevenlabs", "11"),
  "canva": brandMark("canva", "C"),
  "capcut": brandMark("capcut", "CC"),
  "adobe": brandMark("adobe", "A"),
  "figma": brandMark("figma", "F"),
  "microsoft": brandMark("microsoft", "MS"),
  "spotify": brandMark("spotify", "S"),
  "youtube": brandMark("youtube", "YT"),
  "netflix": brandMark("netflix", "N"),
  "amazon-prime": brandMark("amazonprime", "PV"),
  "notion": brandMark("notion", "N"),
  "perplexity": brandMark("perplexity", "P"),
  "cursor": brandMark("cursor", "Cu"),
  "grok": brandMark("x", "G"),
  "codex": brandMark("openai", "CX"),
  "coursera": brandMark("coursera", "Co"),
  "udemy": brandMark("udemy", "U"),
  "duolingo": brandMark("duolingo", "Du"),
  "edx": brandMark("edx", "eX"),
  "github": brandMark("github", "GH"),
  "gmail": brandMark("gmail", "Gm"),
  "outlook": brandMark("microsoftoutlook", "O"),
  "windows": brandMark("windows11", "W"),
  "nordvpn": brandMark("nordvpn", "NV"),
  "surfshark": brandMark("surfshark", "SS"),
  "mcafee": brandMark("mcafee", "Mc"),
  "apple-music": brandMark("applemusic", "AM"),
  "apple-tv": brandMark("appletv", "TV"),
  "crunchyroll": brandMark("crunchyroll", "Cr"),
  "discord": brandMark("discord", "Di"),
  "iqiyi": brandMark("iqiyi", "iQ"),
  "tiktok": brandMark("tiktok", "Tk"),
  "zoom": brandMark("zoom", "Z"),
  "grammarly": brandMark("grammarly", "Gr"),
  "quillbot": brandMark("quillbot", "Q"),
  "ilovepdf": brandMark("ilovepdf", "PDF"),
  "wisprflow": monogram("WF"),
  "lovable": monogram("Lv"),
  "muse": monogram("Mu"),
  "meitu": monogram("Me"),
  "openart": monogram("OA"),
  "kling": monogram("Ki"),
  "veo": brandMark("google", "V"),
  "coreldraw": brandMark("coreldraw", "CD"),
  "autodesk": brandMark("autodesk", "Au"),
  "envato": brandMark("envato", "E"),
  "linkedin": brandMark("linkedin", "in"),
  "granola": monogram("Ga"),
  "brainfm": monogram("BF"),
  "max": monogram("Mx"),
  "hma": monogram("HMA"),
  "tv360": monogram("TV"),
  "replit": brandMark("replit", "R"),
  "manus": monogram("Ma"),
  "windsurf": monogram("Wi"),
  "framer": brandMark("framer", "Fr"),
  "supabase": brandMark("supabase", "Su"),
  "n8n": brandMark("n8n", "n8"),
  "railway": brandMark("railway", "Ry"),
  "linear": brandMark("linear", "Ln"),
  "posthog": brandMark("posthog", "PH"),
  "gamma": brandMark("gamma", "Ga"),
  "freepik": brandMark("freepik", "Fp"),
};

function productInitials(name) {
  const stopWords = /^(?:\d+[a-z]*|api|account|admin|slot|pro|plus|code|link|full|warranty|premium)$/i;
  const words = String(name || '').normalize('NFKC').match(/[a-zA-Z][a-zA-Z0-9]*/g) || [];
  const useful = words.filter((word) => !stopWords.test(word));
  const chosen = useful.length ? useful : words;
  return (chosen.length > 1 ? chosen.slice(0, 2).map((word) => word[0]).join('') : (chosen[0] || '?').slice(0, 2)).toUpperCase();
}

export function iconForProductName(name) {
  const rule = inferFamilyIdentity(name);
  return (rule && brandIcons[rule.icon]) || monogram(productInitials(rule?.name || name));
}

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
