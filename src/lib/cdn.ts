export function getCdnUrl(url: string | null | undefined, width?: number): string | null {
  if (!url) return null;

  let processedUrl = url;
  if (processedUrl.startsWith("http://")) {
    processedUrl = processedUrl.replace(/^http:\/\//i, "https://");
  }

  const rawCdnDomain = process.env.NEXT_PUBLIC_CDN_URL;
  const imageHandlerDomain = process.env.NEXT_PUBLIC_IMAGE_HANDLER_URL;
  const s3Domain = "affan-product-images.s3.ap-south-1.amazonaws.com";

  if (processedUrl.includes(s3Domain)) {
    // If a width is requested and the handler is configured, use Serverless Image Handler
    if (width && imageHandlerDomain) {
      const s3Key = processedUrl.split(`${s3Domain}/`)[1];
      const requestParams = {
        bucket: "affan-product-images",
        key: s3Key,
        edits: {
          // withoutEnlargement, or a small original costs us more than not
          // resizing it at all. Sharp enlarges by default, so a 600px supplier
          // photo asked for at 1024 was being upscaled and re-encoded into a
          // *larger* file with no extra detail — a product page measured 299 KB
          // before this and 307 KB after the width arguments were added, purely
          // from upscaling. Now the source's own size is the ceiling.
          resize: { width, fit: "cover", withoutEnlargement: true },
          toFormat: "webp" // Auto WebP conversion!
        }
      };
      
      const b64 = Buffer.from(JSON.stringify(requestParams)).toString('base64');
      const encodedUrl = b64.replace(/\+/g, '-').replace(/\//g, '_');
      const cleanImageHandlerDomain = imageHandlerDomain.replace(/\/$/, "");
      return `${cleanImageHandlerDomain}/${encodedUrl}`;
    }

    // Fallback: Raw CloudFront URL
    if (rawCdnDomain) {
      const cleanCdnDomain = rawCdnDomain.replace(/\/$/, "");
      return processedUrl.replace(`https://${s3Domain}`, cleanCdnDomain);
    }
    
    return processedUrl;
  }

  // Enforce scale sizing for external CJ Dropshipping / Alibaba OSS domains
  if (width && (processedUrl.includes("cjdropshipping.com") || processedUrl.includes("aliyuncs.com"))) {
    if (!processedUrl.includes("x-oss-process")) {
      const separator = processedUrl.includes("?") ? "&" : "?";
      processedUrl = `${processedUrl}${separator}x-oss-process=image/resize,w_${width}`;
    }
  }

  return processedUrl;
}
