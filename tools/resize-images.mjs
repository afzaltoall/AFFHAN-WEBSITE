import sharp from 'sharp';
import fs from 'node:fs';

const dir = 'public/Landing-chennai-services';
const files = [
  'china-product-sourcing.webp',
  'supplier-verification.webp',
  'freight-forwarding.webp'
];

(async () => {
  for (const file of files) {
    const filePath = `${dir}/${file}`;
    const oldSize = fs.statSync(filePath).size;
    
    const inputBuffer = fs.readFileSync(filePath);
    const outputBuffer = await sharp(inputBuffer)
      .resize(800, 533)
      .webp({ quality: 80 })
      .toBuffer();
      
    fs.writeFileSync(filePath, outputBuffer);
    const newSize = fs.statSync(filePath).size;
    
    console.log(`${file}: ${(oldSize/1024).toFixed(1)} KiB -> ${(newSize/1024).toFixed(1)} KiB`);
  }
})();
