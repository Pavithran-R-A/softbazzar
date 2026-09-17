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

const rupee = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

const discountFor = (priceNum, mrpNum) => (
  Number.isFinite(mrpNum) && mrpNum > priceNum
    ? `${Math.round((1 - priceNum / mrpNum) * 100)}%`
    : ''
);

const normalizeVariant = (variant) => {
  const priceNum = Number(variant.priceNum);
  const mrpNum = Number.isFinite(variant.mrpNum) ? Number(variant.mrpNum) : undefined;
  const mrp = variant.mrp;
  return {
    ...variant,
    priceNum,
    price: variant.price || rupee(priceNum),
    ...(mrp ? { mrp, mrpNum, discount: discountFor(priceNum, mrpNum) } : {}),
  };
};

const makeProduct = (config) => {
  const variants = Array.isArray(config.variants) ? config.variants.map(normalizeVariant) : null;
  const first = variants?.[0];
  const priceNum = Number(config.priceNum ?? first?.priceNum);
  const mrp = config.mrp ?? first?.mrp;
  const mrpNum = Number.isFinite(config.mrpNum) ? Number(config.mrpNum) : first?.mrpNum;
  const price = config.price || first?.price || rupee(priceNum);
  const discount = mrp ? (config.discount ?? first?.discount ?? discountFor(priceNum, mrpNum)) : '';

  return {
    ...config,
    priceNum,
    price,
    ...(mrp ? { mrp, mrpNum, discount } : {}),
    ...(variants ? { variants } : {}),
    desc: config.desc || `${config.name} listed with clear sale pricing and Telegram order confirmation.`,
    features: config.features || [
      'Plan exactly as listed',
      'Order details and payment confirmation on Telegram',
      'Delivery within 10 mins - 16 hours after payment confirmation',
    ],
  };
};

export const products = [
  makeProduct({id:"gemini-pro",name:"Gemini Pro (18 Months)",cat:"AI Tools",icon:"gemini",color:"#4285F4",priceNum:649,mrp:"₹17,550",mrpNum:17550,tag:"Hot Deal"}),
  makeProduct({id:"canva-pro",name:"Canva Pro (3 Years)",cat:"Design & Creative",icon:"canva",color:"#7D2AE8",priceNum:229,mrp:"₹41,621",mrpNum:41621,tag:"Popular"}),
  makeProduct({id:"chatgpt-plus",name:"ChatGPT Plus (1 Month)",cat:"AI Tools",icon:"chatgpt",color:"#10A37F",priceNum:699,mrp:"₹1,999",mrpNum:1999,tag:"Trending"}),
  makeProduct({id:"super-grok",name:"Super Grok",cat:"AI Tools",icon:"grok",color:"#111111",variants:[{name:"1 Year",priceNum:1749,mrp:"₹34,423",mrpNum:34423},{name:"7–10 Days",priceNum:199,mrp:"₹956",mrpNum:956}]}),
  makeProduct({id:"microsoft-365-lifetime",name:"Microsoft 365 (Lifetime)",cat:"Productivity",icon:"microsoft",color:"#5E5E5E",priceNum:999,mrp:"₹6,899/Year",mrpNum:6899,tag:"Popular"}),
  makeProduct({id:"coursera-1y",name:"Coursera (1 Year)",cat:"Education",icon:"coursera",color:"#0056D2",priceNum:1299,mrp:"₹34,000",mrpNum:34000}),
  makeProduct({id:"capcut-pro",name:"CapCut Pro",cat:"Design & Creative",icon:"capcut",color:"#111111",tag:"Popular",variants:[{name:"1 Month • Ready Account • 25 Days Warranty",priceNum:449,mrp:"₹999",mrpNum:999},{name:"1 Week",priceNum:99,mrp:"₹249",mrpNum:249},{name:"1 Month • Ready Account • 7 Days Warranty",priceNum:229,mrp:"₹999",mrpNum:999}]}),
  makeProduct({id:"autodesk-all-apps-1y",name:"Autodesk All Apps (1 Year)",cat:"Software & Licenses",icon:"autodesk",color:"#0696D7",priceNum:999,mrp:"₹2.2 Lakhs",mrpNum:220000,tag:"Hot Deal"}),
  makeProduct({id:"windows-pro-retail",name:"Windows 10/11 Pro Retail Key",cat:"Software & Licenses",icon:"windows",color:"#00A4EF",priceNum:999,mrp:"₹12,000",mrpNum:12000}),
  makeProduct({id:"linkedin-premium-1y",name:"LinkedIn Premium (Any Plan • 1 Year)",cat:"Productivity",icon:"linkedin",color:"#0A66C2",priceNum:1499,mrp:"₹19,999",mrpNum:19999}),
  makeProduct({id:"replit-core-1y",name:"Replit Core (1 Year)",cat:"Developer Tools",icon:"replit",color:"#F26207",priceNum:3999,mrp:"₹17,000",mrpNum:17000}),
  makeProduct({id:"manus-ai-pro",name:"Manus AI Pro",cat:"AI Tools",icon:"manus",color:"#111111",variants:[{name:"1 Year • 4K Credits/Month",priceNum:3999,mrp:"₹22,948",mrpNum:22948},{name:"1 Week",priceNum:299,mrp:"₹439",mrpNum:439}]}),
  makeProduct({id:"notion-edu-1y",name:"Notion Edu (1 Year)",cat:"Productivity",icon:"notion",color:"#FFFFFF",priceNum:499,mrp:"₹11,491",mrpNum:11491}),
  makeProduct({id:"netflix-4k-slot-1m",name:"Netflix 4K (1 Slot • 1 Month)",cat:"OTT & Media",icon:"netflix",color:"#E50914",priceNum:229,mrp:"₹649",mrpNum:649}),
  makeProduct({id:"chatgpt-k12-cdk-2y",name:"ChatGPT K12-CDK (2 Years)",cat:"AI Tools",icon:"chatgpt",color:"#10A37F",priceNum:1399,mrp:"₹2,199",mrpNum:2199}),
  makeProduct({id:"autodesk-education-3y-panel",name:"Autodesk Education (3 Years • 3000 Users Panel)",cat:"Education",icon:"autodesk",color:"#0696D7",priceNum:5999,mrp:"₹3,00,000",mrpNum:300000}),
  makeProduct({id:"autodesk-education-renewal-1y",name:"Autodesk Education Renewal (1 Year • 3000 Users Panel)",cat:"Education",icon:"autodesk",color:"#0696D7",priceNum:1999,mrp:"₹34,000",mrpNum:34000}),
  makeProduct({id:"cursor-ai-pro-1y",name:"Cursor AI Pro (1 Year)",cat:"Developer Tools",icon:"cursor",color:"#111111",priceNum:9999,mrp:"₹20,500",mrpNum:20500}),
  makeProduct({id:"adobe-creative-cloud-14d",name:"Adobe Creative Cloud (14 Days)",cat:"Design & Creative",icon:"adobe",color:"#FF0000",priceNum:199,mrp:"₹2,450",mrpNum:2450}),
  makeProduct({id:"adobe-creative-cloud-pro-3m",name:"Adobe Creative Cloud Pro (Ready Account • 3 Months)",cat:"Design & Creative",icon:"adobe",color:"#FF0000",priceNum:649,mrp:"₹20,051",mrpNum:20051}),
  makeProduct({id:"figma-edu-pro",name:"Figma Edu (Pro • 1–2 Years)",cat:"Design & Creative",icon:"figma",color:"#A259FF",priceNum:1299,mrp:"₹36,772",mrpNum:36772}),
  makeProduct({id:"ilovepdf-pro-1y",name:"ILovePDF Pro (Ready Account • 1 Year)",cat:"Productivity",icon:"ilovepdf",color:"#E5322D",priceNum:399,mrp:"₹2,400",mrpNum:2400}),
  makeProduct({id:"quillbot-premium-1m",name:"QuillBot Premium (1 Month)",cat:"AI Tools",icon:"quillbot",color:"#499557",priceNum:399,mrp:"₹999",mrpNum:999}),
  makeProduct({id:"deepl-pro-1m",name:"DeepL Pro (1 Month)",cat:"AI Tools",icon:"deepl",color:"#0F2B46",priceNum:499,mrp:"₹2,744",mrpNum:2744}),
  makeProduct({id:"deepl-pro-api-1m",name:"DeepL Pro API (1 Month)",cat:"Developer Tools",icon:"deepl",color:"#0F2B46",priceNum:349,mrp:"₹899",mrpNum:899}),
  makeProduct({id:"elevenlabs-creator-1y",name:"ElevenLabs Creator (1 Year)",cat:"AI Tools",icon:"elevenlabs",color:"#111111",priceNum:4499,mrp:"₹21,000",mrpNum:21000}),
  makeProduct({id:"framer-pro-1y",name:"Framer Pro (1 Year)",cat:"Design & Creative",icon:"framer",color:"#0055FF",priceNum:1999,mrp:"₹34,423",mrpNum:34423}),
  makeProduct({id:"lovable-unlimited",name:"Lovable.dev Unlimited",cat:"Developer Tools",icon:"lovable",color:"#FF5C7A",variants:[{name:"Unlimited Credits • Single User",priceNum:799,mrp:"₹2,390",mrpNum:2390},{name:"Unlimited Credits • Admin Panel",priceNum:1999},{name:"Unlimited • 1 Day",priceNum:149}]}),
  makeProduct({id:"supabase-pro-1y",name:"Supabase Pro (1 Year)",cat:"Developer Tools",icon:"supabase",color:"#3ECF8E",priceNum:4499,mrp:"₹21,000",mrpNum:21000}),
  makeProduct({id:"n8n-starter-1y",name:"n8n Starter (1 Year)",cat:"Developer Tools",icon:"n8n",color:"#EA4B71",priceNum:2499,mrp:"₹21,000",mrpNum:21000}),
  makeProduct({id:"warp-build-1y",name:"Warp.dev Build (1 Year)",cat:"Developer Tools",icon:"warp",color:"#6B57FF",priceNum:1999,mrp:"₹17,000",mrpNum:17000}),
  makeProduct({id:"railway-hobby-1y",name:"Railway Hobby (1 Year)",cat:"Developer Tools",icon:"railway",color:"#111111",priceNum:1999,mrp:"₹8,999",mrpNum:8999}),
  makeProduct({id:"linear-business-1y",name:"Linear.app Business (1 Year)",cat:"Productivity",icon:"linear",color:"#5E6AD2",priceNum:749,mrp:"₹14,000",mrpNum:14000}),
  makeProduct({id:"gumloop-pro-1y",name:"Gumloop Pro (20K Credits/Month • 1 Year)",cat:"Developer Tools",icon:"gumloop",color:"#FF7A00",priceNum:1499,mrp:"₹34,494",mrpNum:34494}),
  makeProduct({id:"chatprd-pro-1y",name:"chatPRD Pro (1 Year)",cat:"Developer Tools",icon:"chatprd",color:"#6D5DFB",priceNum:1499,mrp:"₹5,999",mrpNum:5999}),
  makeProduct({id:"reclaim-startup-1y",name:"Reclaim.ai Startup Pack (1 Year)",cat:"Productivity",icon:"reclaim",color:"#6B4EFF",priceNum:1499,mrp:"₹11,491",mrpNum:11491}),
  makeProduct({id:"wisprflow-ai-1y",name:"WisprFlow AI (1 Year)",cat:"AI Tools",icon:"wisprflow",color:"#5A67D8",priceNum:1999,mrp:"₹13,000",mrpNum:13000}),
  makeProduct({id:"posthog-scale-1y",name:"PostHog Scale (1 Year)",cat:"Developer Tools",icon:"posthog",color:"#F9BD2B",priceNum:1699,mrp:"US$24,000"}),
  makeProduct({id:"factory-ai-pro-1y",name:"Factory AI Pro (1 Year)",cat:"AI Tools",icon:"factory",color:"#111111",priceNum:1999,mrp:"₹22,999",mrpNum:22999}),
  makeProduct({id:"granola-ai-business-1y",name:"Granola AI Business (1 Year)",cat:"AI Tools",icon:"granola",color:"#F3E9D2",priceNum:799,mrp:"₹16,064",mrpNum:16064}),
  makeProduct({id:"gamma-app-pro-1y",name:"Gamma App Pro (1 Year)",cat:"AI Tools",icon:"gamma",color:"#292929",priceNum:3999,mrp:"₹17,000",mrpNum:17000}),
  makeProduct({id:"dreamina-seedance-basic",name:"Dreamina Basic Seedance 2.0",cat:"Design & Creative",icon:"dreamina",color:"#111111",priceNum:249}),
  makeProduct({id:"adobe-substance-3d-1m",name:"Adobe Substance 3D Collection (1 Month • Redeem Key)",cat:"Design & Creative",icon:"adobe",color:"#FF0000",priceNum:229,mrp:"₹4,500",mrpNum:4500}),
  makeProduct({id:"adobe-acrobat-standard-1m",name:"Adobe Acrobat Standard DC (1 Month • Redeem Key)",cat:"Productivity",icon:"adobe",color:"#FF0000",priceNum:229,mrp:"₹1,200",mrpNum:1200}),
  makeProduct({id:"magic-patterns-hobby-1y",name:"Magic Patterns Hobby (1 Year)",cat:"Design & Creative",icon:"magicpatterns",color:"#7C3AED",priceNum:849,mrp:"₹8,500",mrpNum:8500}),
  makeProduct({id:"miro-premium-1-3y",name:"Miro Premium (1–3 Years)",cat:"Productivity",icon:"miro",color:"#FFD02F",priceNum:499,mrp:"₹7,999",mrpNum:7999}),
  makeProduct({id:"mobbin-team-1y",name:"Mobbin Team (10 Users • 1 Year)",cat:"Design & Creative",icon:"mobbin",color:"#111111",priceNum:1499,mrp:"₹17,999",mrpNum:17999}),
  makeProduct({id:"intercom-advanced-1y",name:"Intercom Advanced (1 Year)",cat:"Productivity",icon:"intercom",color:"#286EFA",priceNum:1499,mrp:"₹98,000",mrpNum:98000}),
  makeProduct({id:"freepik-magnific",name:"Freepik (Magnific)",cat:"Design & Creative",icon:"freepik",color:"#1273EB",variants:[{name:"1 Month",priceNum:749,mrp:"₹1,740",mrpNum:1740},{name:"3 Months",priceNum:1999,mrp:"₹5,220",mrpNum:5220},{name:"6 Months",priceNum:3999,mrp:"₹10,440",mrpNum:10440},{name:"12 Months",priceNum:7999,mrp:"₹15,140",mrpNum:15140}]}),
  makeProduct({id:"envato-elements",name:"Envato Elements",cat:"Design & Creative",icon:"envato",color:"#81B441",tag:"Popular",variants:[{name:"1 Month",priceNum:799,mrp:"₹3,390",mrpNum:3390},{name:"3 Months",priceNum:2299,mrp:"₹10,170",mrpNum:10170},{name:"6 Months",priceNum:4499,mrp:"₹20,340",mrpNum:20340},{name:"12 Months",priceNum:8999,mrp:"₹40,680",mrpNum:40680}]}),
];

export const categories = ['All', ...new Set(products.map((product) => product.cat))];
