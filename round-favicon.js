import Jimp from 'jimp';

async function roundFavicon() {
  try {
    console.log('Reading favicon.png...');
    const image = await Jimp.read('public/favicon.png');
    
    console.log('Applying circular mask...');
    image.circle();
    
    console.log('Writing back to public/favicon.png...');
    await image.writeAsync('public/favicon.png');
    console.log('Favicon rounded successfully.');
  } catch (err) {
    console.error('Error processing favicon:', err);
  }
}

roundFavicon();
