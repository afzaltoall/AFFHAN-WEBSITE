export function getCdnUrl(url: string | null | undefined, width?: number): string | null {
  if (!url) return null;

  const rawCdnDomain = process.env.NEXT_PUBLIC_CDN_URL;
  const imageHandlerDomain = process.env.NEXT_PUBLIC_IMAGE_HANDLER_URL;
  const s3Domain = "affan-product-images.s3.ap-south-1.amazonaws.com";

  if (url.includes(s3Domain)) {
    // If a width is requested and the handler is configured, use Serverless Image Handler
    if (width && imageHandlerDomain) {
      const s3Key = url.split(`${s3Domain}/`)[1];
      const requestParams = {
        bucket: "affan-product-images",
        key: s3Key,
        edits: {
          resize: { width, fit: "cover" },
          toFormat: "webp" // Auto WebP conversion!
        }
      };
      
      const b64 = Buffer.from(JSON.stringify(requestParams)).toString('base64');
      const encodedUrl = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const cleanImageHandlerDomain = imageHandlerDomain.replace(/\/$/, "");
      return `${cleanImageHandlerDomain}/${encodedUrl}`;
    }

    // Fallback: Raw CloudFront URL
    if (rawCdnDomain) {
      const cleanCdnDomain = rawCdnDomain.replace(/\/$/, "");
      return url.replace(`https://${s3Domain}`, cleanCdnDomain);
    }
  }

  return url;
}
