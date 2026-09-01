import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

/**
 * Video and thumbnail storage.
 *
 * Files live under a `videos/` prefix in the same bucket the product images
 * use, so the existing CloudFront distribution serves them and there is no new
 * bucket, distribution, DNS entry or cache policy to maintain.
 *
 * The browser uploads directly to S3 with a presigned PUT. It has to: a Vercel
 * function caps its request body at 4.5MB, which is smaller than almost any
 * real video, so routing the file through an API route would work in
 * development and fail on the first genuine upload.
 */

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME!;
const CDN = process.env.NEXT_PUBLIC_CDN_URL!;

/** Only formats a browser can actually play back, and the poster image. */
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** 512MB. Large enough for a long clip, small enough to bound abuse. */
export const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
export const MAX_THUMB_BYTES = 8 * 1024 * 1024;

function extensionFor(contentType: string) {
  switch (contentType) {
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/**
 * A presigned PUT and the public URL the file will have once uploaded.
 *
 * The key is generated here rather than taken from the client: letting a
 * caller choose its own key would let it overwrite any object in the bucket,
 * product images included.
 */
export async function createUploadTarget(kind: "video" | "thumbnail", contentType: string) {
  const allowed = kind === "video" ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES;
  if (!allowed.includes(contentType)) {
    throw new Error(`Unsupported ${kind} type: ${contentType}`);
  }

  const key = `videos/${kind === "video" ? "source" : "thumbs"}/${crypto.randomUUID()}.${extensionFor(contentType)}`;
  const maxSize = kind === "video" ? MAX_VIDEO_BYTES : MAX_THUMB_BYTES;

  const { url, fields } = await createPresignedPost(s3, {
    Bucket: BUCKET,
    Key: key,
    Conditions: [
      ["content-length-range", 1, maxSize],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: {
      "Content-Type": contentType,
    },
    // Long enough for a slow upload of a large file to start, short enough
    // that a leaked URL is not a standing write grant.
    Expires: 900,
  });

  return { uploadUrl: url, fields, publicUrl: `${CDN}/${key}`, key };
}

/** CloudFront URL back to the S3 key it was served from. */
export function keyFromPublicUrl(url: string): string | null {
  if (!url.startsWith(`${CDN}/`)) return null;
  const key = url.slice(CDN.length + 1);
  // Only ever delete inside our own prefix, whatever the row happens to hold.
  return key.startsWith("videos/") ? key : null;
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
