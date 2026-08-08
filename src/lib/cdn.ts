export function getCdnUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const cdnDomain = process.env.NEXT_PUBLIC_CDN_URL;
  if (!cdnDomain) return url;

  // Replace the S3 bucket domain with the CloudFront domain if it exists
  const s3Domain = "affan-product-images.s3.ap-south-1.amazonaws.com";
  
  if (url.includes(s3Domain)) {
    // Strip trailing slash from CDN domain if it exists, to avoid double slashes
    const cleanCdnDomain = cdnDomain.replace(/\/$/, "");
    return url.replace(`https://${s3Domain}`, cleanCdnDomain);
  }

  return url;
}
