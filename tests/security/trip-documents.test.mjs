// The Free China Trip's ID proof (2026-11-02): the Aadhaar or passport of someone who applied through an employee's
// link. It must live in its own private bucket, never the product images' (whose policy lets anyone read any file in
// it); only an administrator may open one; only a live employee's link may upload one; and only a key the upload
// route made can name one.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { isIdDocumentKey, idDocumentTypeOfKey } = await import("../../src/lib/trip-referral-shared.ts");
/** A source file's code, its comments taken out (they name the public bucket to say why it is not used). */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const ID = "0b3c2f4e-8d1a-4c5b-9e7f-112233445566";

test("only docs/<uuid>.<jpg|png|webp|pdf> is a document key", () => {
  for (const ext of ["jpg", "png", "webp", "pdf"]) assert.ok(isIdDocumentKey(`docs/${ID}.${ext}`), ext);
  for (const key of [
    `suppliers/${ID}.jpg`,
    `products/a/b/${ID}.jpg`,
    `docs/../products/${ID}.jpg`,
    `docs/${ID}.gif`,
    `docs/${ID}.jpg/x`,
    `docs/not-a-uuid.jpg`,
    `/docs/${ID}.jpg`,
    `https://affan-product-images.s3.ap-south-1.amazonaws.com/docs/${ID}.jpg`,
    "",
    null,
    42,
  ]) {
    assert.equal(isIdDocumentKey(key), false, String(key));
  }
  assert.equal(idDocumentTypeOfKey(`docs/${ID}.pdf`), "application/pdf");
});

test("the files go to their own private bucket, never the public product one or its CDN", () => {
  const src = read("src/lib/server/trip-documents.ts");
  assert.match(src, /process\.env\.TRIP_DOCUMENTS_BUCKET \|\| "affhan-trip-documents"/);
  assert.doesNotMatch(src, /S3_BUCKET_NAME|NEXT_PUBLIC_CDN_URL|affan-product-images|cloudfront/i);
  // A link to view one lasts five minutes; uploads are held to their type and 10 MB by the policy.
  assert.match(src, /expiresIn: 300/);
  assert.match(src, /"content-length-range", 1, ID_DOCUMENT_MAX_BYTES/);
  assert.match(src, /"eq", "\$Content-Type", contentType/);
});

test("only an administrator opens one, and the check comes first", () => {
  const src = read("src/app/api/admin/trip-documents/[id]/route.ts");
  const check = src.indexOf('admin.role !== "admin"');
  assert.ok(check > 0, "admin check");
  assert.ok(check < src.indexOf("tripApplicationDocument.findUnique"), "before the database");
  assert.ok(check < src.indexOf("documentViewUrl(doc"), "before any link is made");
});

test("only a live employee's link gets an upload ticket", () => {
  const src = read("src/app/api/trip-applications/document-url/route.ts");
  const live = src.indexOf("liveReferralCode(body.code)");
  assert.ok(live > 0, "the link is checked");
  assert.ok(live < src.indexOf("documentUploadTarget(body.contentType)"), "before a ticket");
});

test("the employee's own page never reads anyone's ID proof", () => {
  const page = read("src/app/employee/(workspace)/referrals/page.tsx");
  assert.doesNotMatch(page, /withDocuments|trip-documents|documents/);
  assert.match(read("src/app/admin/(console)/trip-referrals/page.tsx"), /withDocuments: true/);
});
