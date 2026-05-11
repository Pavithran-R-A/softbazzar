import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import fetch from 'node-fetch'; // fetch is available in modern Node

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'bundles');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const BUNDLES_LIST = [
  { name: 'Animated Dancing Bundle', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/ZSxsacVI.webp' },
  { name: 'AI Hulk Reel', price: 99, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/a9mYHHRi.webp' },
  { name: 'Monkey Vlogging Bundle', price: 99, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/d1Z85V2t.webp' },
  { name: 'All In One Bundle', price: 999, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/YSH9sKUJ.webp' },
  { name: 'Shopify 500+ Themes', price: 99, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/N3XcbrWr.webp' },
  { name: 'Ben 10 Bundle', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/tWjW3qV3.webp' },
  { name: 'Oggy and Cockroaches', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/pDQ8kcWE.webp' },
  { name: 'Mr. Bean Bundle', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/znS5LqWT.webp' },
  { name: 'Doraemon Bundle Pack', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/OFTcyzU0.webp' },
  { name: 'Motivational Money Bundle', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/ACk8I8eR.webp' },
  { name: 'Bageshwar Baba Pack', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/tT4fmS7D.webp' },
  { name: 'Anime Quotes Pack', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/fk10vl6o.webp' },
  { name: 'Luxury Watches Reel Pack', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/vQZZTE9t.webp' },
  { name: 'Space Reels Bundle', price: 49, img: 'https://cdn.dotpe.in/longtail/store-items/9166512/YtmaAQiy.webp' }
];

async function processImage(url, filename) {
  try {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    
    const metadata = await sharp(Buffer.from(buffer)).metadata();
    const w = metadata.width;
    const h = metadata.height;
    
    const boxHeight = 60;
    
    // Create an SVG overlay for the black box and text
    const svgOverlay = `
      <svg width="${w}" height="${h}">
        <rect x="0" y="${h - boxHeight}" width="${w}" height="${boxHeight}" fill="rgba(0,0,0,0.8)" />
        <text x="10" y="${h - 20}" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="white">SOFTBAZZAR.COM</text>
      </svg>
    `;
    
    const outputPath = path.join(OUTPUT_DIR, filename);
    await sharp(Buffer.from(buffer))
      .composite([{
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      }])
      .webp()
      .toFile(outputPath);
      
    console.log(`Processed: ${filename}`);
    return `/bundles/${filename}`;
  } catch (err) {
    console.error(`Error processing ${url}:`, err);
    return null;
  }
}

async function main() {
  console.log(`Processing ${BUNDLES_LIST.length} bundles...`);
  
  let productsCode = '';
  let iconsCode = '';
  
  for (let i = 0; i < BUNDLES_LIST.length; i++) {
    const bundle = BUNDLES_LIST[i];
    const id = `cb-bundle-${i}`;
    
    const filename = `${id}.webp`;
    const processedUrl = await processImage(bundle.img, filename);
    
    if (processedUrl) {
       iconsCode += `  '${id}': \`<img src="\${'${processedUrl}'}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" />\`,\n`;
    }
    
    // Hike price by 20%
    const basePrice = bundle.price;
    const hikedPrice = Math.ceil(basePrice * 1.20);
    
    productsCode += `  {id:'${id}',name:'${bundle.name.replace(/'/g, "\\'")}',cat:'Digital Bundles',mrp:'₹999',discount:'95%',icon:'${id}',tag:null,color:'#6366f1',
    desc:'Premium digital bundle for social media growth. Ready to use and highly engaging.', features:['HD Quality','Ready to Use','Instant Access'],
    variants: [{name:'Full Bundle', price:'₹${hikedPrice}', priceNum:${hikedPrice}}]},\n`;
  }
  
  fs.writeFileSync('bundles-output.txt', `\n// --- GENERATED ICONS ---\n${iconsCode}\n\n// --- GENERATED PRODUCTS ---\n${productsCode}`);
  console.log('Finished. Check bundles-output.txt');
}

main();
