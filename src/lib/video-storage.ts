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

/**
 * The bucket's region: S3_REGION when it is set, otherwise ap-south-1, where
 * the bucket lives. Never AWS_REGION.
 *
 * AWS_REGION is not ours to set in production. The functions run on AWS
 * Lambda, which fills it in with the region the *function* runs in — us-east-1
 * for Vercel's default location — whatever the project's own settings say. So
 * the live site signed every upload for us-east-1 against a bucket in
 * ap-south-1. S3 answers that with a 301 "PermanentRedirect" that carries no
 * CORS header, which a browser can only report as "blocked by CORS policy":
 * "Failed to fetch" on the staff photo button, and the same on video uploads.
 * Locally .env said ap-south-1, which is why none of it showed up here.
 */
export const S3_REGION = process.env.S3_REGION || "ap-south-1";

/**
 * The keys, under our own names first.
 *
 * AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY belong to the runtime for the
 * same reason AWS_REGION does — Lambda fills them in with the function's own
 * role — so a deployment can hold values that are real, signed with, and
 * useless against this bucket. S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are
 * names nothing else writes; the AWS_ ones stay as a fallback because that is
 * what .env uses locally.
 */
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "";
const SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "";

const s3 = new S3Client({
  region: S3_REGION,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
});

const BUCKET = process.env.S3_BUCKET_NAME || "";
const CDN = process.env.NEXT_PUBLIC_CDN_URL || "";

/**
 * What is missing before anything can be uploaded, in plain words, or null.
 *
 * Without this a deployment with no storage settings still produced an upload
 * ticket — the SDK signed one against no bucket at all, addressed to the bare
 * region endpoint — and the browser could only report the 405 that came back as
 * "blocked by CORS policy". A missing setting should say which setting.
 */
export function storageConfigProblem(): string | null {
  const missing = [
    !BUCKET && "S3_BUCKET_NAME",
    !CDN && "NEXT_PUBLIC_CDN_URL",
    !ACCESS_KEY_ID && "S3_ACCESS_KEY_ID",
    !SECRET_ACCESS_KEY && "S3_SECRET_ACCESS_KEY",
  ].filter(Boolean) as string[];
  return missing.length
    ? `Uploads are not set up on this deployment — ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing. An administrator needs to add ${missing.length === 1 ? "it" : "them"} to the site's environment variables.`
    : null;
}

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
export async function createUploadTarget(
  kind: "video" | "thumbnail" | "employee",
  contentType: string
) {
  const problem = storageConfigProblem();
  if (problem) throw new Error(problem);

  const allowed = kind === "video" ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES;
  if (!allowed.includes(contentType)) {
    throw new Error(`Unsupported ${kind} type: ${contentType}`);
  }

  // Staff photos get their own prefix rather than being filed under videos/,
  // so the bucket still says what each object is for. keyFromPublicUrl below
  // deliberately does not admit it: the delete path exists for videos, and a
  // staff photo that has been replaced is not worth a delete that could be
  // pointed at anything else.
  const key =
    kind === "employee"
      ? `employees/${crypto.randomUUID()}.${extensionFor(contentType)}`
      : `videos/${kind === "video" ? "source" : "thumbs"}/${crypto.randomUUID()}.${extensionFor(contentType)}`;
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

/**
 * Is this a staff photo we issued the upload for?
 *
 * An admin setting a photo is trusted to paste anything. A member of staff
 * setting their own is not: whatever they save is shown to the admin and on
 * the activity feed, so it has to be an object under our own employees/
 * prefix — the only thing the upload route below will ever have issued them.
 */
export function isStaffPhotoUrl(url: string): boolean {
  return Boolean(CDN) && url.startsWith(`${CDN}/employees/`) && !url.includes("..");
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
