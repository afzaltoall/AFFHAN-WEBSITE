import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export function slugify(str: string | undefined | null) {
  if (!str) return 'uncategorized';
  return str
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getExtensionFromUrlOrType(url: string, contentType: string | null) {
  const urlExt = url.split('?')[0].split('.').pop();
  if (urlExt && urlExt.length <= 4 && /^[a-zA-Z0-9]+$/.test(urlExt)) {
    return urlExt.toLowerCase();
  }
  if (contentType && contentType.includes('/')) {
    return contentType.split('/')[1].split(';')[0];
  }
  return 'jpg';
}

export async function uploadImageToS3(
  imageUrl: string, 
  skuOrId: string,
  rootCategory: string = 'uncategorized',
  subCategory: string = 'uncategorized',
  leafCategory: string = 'uncategorized'
): Promise<string> {
  const response = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  
  if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const ext = getExtensionFromUrlOrType(imageUrl, contentType);
  
  const folderPath = [rootCategory, subCategory, leafCategory]
    .map(c => slugify(c))
    .join('/');
    
  const key = `products/${folderPath}/${slugify(skuOrId)}.${ext}`;
  const bucketName = process.env.S3_BUCKET_NAME!;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}
