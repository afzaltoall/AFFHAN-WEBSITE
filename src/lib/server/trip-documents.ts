import "server-only";
import { randomUUID } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ID_DOCUMENT_MAX_BYTES, idDocumentExtension, type IdDocumentType } from "@/lib/trip-referral-shared";

/**
 * The ID proof of applicants who came through an employee's link (the owner, 2026-11-02): Aadhaar, passport or any
 * ID, a photo or a PDF. These are kept in their own PRIVATE bucket, never the product images' one: that bucket lets
 * anyone read any file in it by its address (its policy grants s3:GetObject to "*", and CloudFront serves it), which
 * is right for product photos and wrong for somebody's Aadhaar.
 *
 * The browser uploads straight to S3 with a presigned POST whose policy holds the type and the size (Vercel caps a
 * request body at 4.5 MB, and a phone's photo can be more); the key is made here, never chosen by the browser. The
 * console opens a file through a link signed for five minutes, made only for an administrator
 * (/api/admin/trip-documents/[id]); nobody else ever gets one, the employee who brought the applicant included.
 *
 * The keys and region follow lib/video-storage.ts (S3_* first, because Lambda fills AWS_* with its own). The bucket
 * is affhan-trip-documents unless TRIP_DOCUMENTS_BUCKET names another. TRIP_DOCUMENTS_S3_ENDPOINT points it at a
 * stand-in S3 for the release gate; it is never set on Vercel.
 */
export const DOCUMENTS_BUCKET = process.env.TRIP_DOCUMENTS_BUCKET || "affhan-trip-documents";
const REGION = process.env.S3_REGION || "ap-south-1";
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "";
const SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "";
const ENDPOINT = process.env.TRIP_DOCUMENTS_S3_ENDPOINT || "";

const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  ...(ENDPOINT ? { endpoint: ENDPOINT, forcePathStyle: true } : {}),
});

/** What is missing before a document can be uploaded, or null. */
export function documentStorageProblem(): string | null {
  const missing = [!ACCESS_KEY_ID && "S3_ACCESS_KEY_ID", !SECRET_ACCESS_KEY && "S3_SECRET_ACCESS_KEY"].filter(Boolean);
  return missing.length ? `ID uploads are not set up: ${missing.join(", ")} missing.` : null;
}

/** Where the browser posts one file: the URL, the policy's fields to send with it, and the key it will have. */
export async function documentUploadTarget(contentType: IdDocumentType) {
  const key = `docs/${randomUUID()}.${idDocumentExtension(contentType)}`;
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: DOCUMENTS_BUCKET,
    Key: key,
    Conditions: [
      ["content-length-range", 1, ID_DOCUMENT_MAX_BYTES],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
    // Long enough for a slow connection to start, short enough that a leaked one is no standing grant.
    Expires: 900,
  });
  return { uploadUrl: url, fields, key };
}

export type DocumentCheck =
  | { key: string; state: "ok"; contentType: string; size: number | null }
  | { key: string; state: "missing" }
  /** S3 could not be asked (a timeout, a permission): the upload is trusted, as the form only sends finished ones. */
  | { key: string; state: "unknown" };

/** Whether each upload is really there, and what it is, asked of S3 at once (five seconds at most). */
export async function checkDocuments(keys: string[]): Promise<DocumentCheck[]> {
  return Promise.all(
    keys.map(async (key): Promise<DocumentCheck> => {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: key }), { abortSignal: AbortSignal.timeout(5000) });
        return { key, state: "ok", contentType: head.ContentType ?? "application/octet-stream", size: typeof head.ContentLength === "number" ? head.ContentLength : null };
      } catch (e) {
        const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
        if (status === 404 || (e as { name?: string })?.name === "NotFound") return { key, state: "missing" };
        console.error("trip document check:", (e as { name?: string })?.name ?? "unknown");
        return { key, state: "unknown" };
      }
    }),
  );
}

/** A link to one file, good for five minutes, shown in the browser (never downloaded as an attachment). */
export function documentViewUrl(key: string, contentType: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: key, ResponseContentType: contentType, ResponseContentDisposition: "inline" }), { expiresIn: 300 });
}
