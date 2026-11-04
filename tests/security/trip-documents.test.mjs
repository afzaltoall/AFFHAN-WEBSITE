// The Free China Trip's ID proof (2026-11-02): the Aadhaar or passport of someone who applied through an employee's
// link. It must live in its own private bucket, never the product images' (whose policy lets anyone read any file in
// it); only an administrator may open one; only a live employee's link may upload one; and only a key the upload
// route made can name one.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { ID_PROOFS, idDocumentTypeOfKey, idProofOfKey, isIdDocumentKey, isIdProof } = await import("../../src/lib/trip-referral-shared.ts");
/** A source file's code, its comments taken out (they name the public bucket to say why it is not used). */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const ID = "0b3c2f4e-8d1a-4c5b-9e7f-112233445566";

test("only docs/<id>/<uuid>.<jpg|png|webp|pdf> (or an older docs/<uuid>.<ext>) is a document key", () => {
  for (const ext of ["jpg", "png", "webp", "pdf"]) assert.ok(isIdDocumentKey(`docs/${ID}.${ext}`), ext);
  for (const p of ID_PROOFS) assert.ok(isIdDocumentKey(`docs/${p.id}/${ID}.jpg`), p.id);
  for (const key of [
    `suppliers/${ID}.jpg`,
    `products/a/b/${ID}.jpg`,
    `docs/../products/${ID}.jpg`,
    `docs/${ID}.gif`,
    `docs/${ID}.jpg/x`,
    `docs/not-a-uuid.jpg`,
    `docs/ration/${ID}.jpg`,
    `docs/aadhaar/aadhaar/${ID}.jpg`,
    `docs/AADHAAR/${ID}.jpg`,
    `/docs/${ID}.jpg`,
    `https://affan-product-images.s3.ap-south-1.amazonaws.com/docs/${ID}.jpg`,
    "",
    null,
    42,
  ]) {
    assert.equal(isIdDocumentKey(key), false, String(key));
  }
  assert.equal(idDocumentTypeOfKey(`docs/${ID}.pdf`), "application/pdf");
  assert.equal(idDocumentTypeOfKey(`docs/pan/${ID}.pdf`), "application/pdf");
});

// The owner, 2026-11-03: "aadhar / pan / voter id / license / passport ... only these, nothing else".
// 2026-11-04: "create one more emirates id document", then "insert one more other id thats it".
test("the IDs, and no other, name an upload", () => {
  assert.deepEqual(ID_PROOFS.map((p) => p.id), ["aadhaar", "pan", "voter", "licence", "passport", "emirates", "other"]);
  assert.deepEqual(ID_PROOFS.map((p) => p.label), ["Aadhaar", "PAN card", "Voter ID", "Driving licence", "Passport", "Emirates ID", "Other ID"]);
  for (const p of ID_PROOFS) assert.equal(idProofOfKey(`docs/${p.id}/${ID}.jpg`), p.id);
  assert.equal(idProofOfKey(`docs/${ID}.jpg`), null, "a file from before the five names none");
  for (const v of ["ration", "", "Aadhaar", null, 1]) assert.equal(isIdProof(v), false, String(v));
  // A ticket is refused without one of the five, and the key it makes names it.
  const route = read("src/app/api/trip-applications/document-url/route.ts");
  assert.ok(route.includes("if (!isIdProof(body.proof)) return NextResponse.json({ error: ID_PROOF_NEEDED }, { status: 400 });"), "refused without one");
  assert.ok(route.indexOf("isIdProof(body.proof)") < route.indexOf("documentUploadTarget("), "before a ticket");
  assert.ok(read("src/lib/server/trip-documents.ts").includes("const key = `docs/${proof}/${randomUUID()}."), "the key names it");
  // An application through a link needs a file added as one of them.
  assert.ok(read("src/app/api/trip-applications/route.ts").includes("if (referral && !documentKeys.some((k) => idProofOfKey(k)))"), "an application needs one");
});

test("the files go to their own private bucket, never the public product one or its CDN", () => {
  const src = read("src/lib/server/trip-documents.ts");
  assert.match(src, /process\.env\.TRIP_DOCUMENTS_BUCKET \|\| "affhan-trip-documents"/);
  assert.doesNotMatch(src, /S3_BUCKET_NAME|NEXT_PUBLIC_CDN_URL|affan-product-images|cloudfront/i);
  // A link to view one lasts a minute and is never cached (2026-11-04; it was five minutes); uploads are held to their
  // type and 10 MB by the policy.
  assert.match(src, /expiresIn: 60\b/);
  assert.match(src, /ResponseCacheControl: "private, no-store"/);
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

// The owner, 2026-11-04: "keep it secure ... with a password, a strong lock, access only for admin".
test("and only once they have opened ID proofs with their password, checked before the database or any link", () => {
  const src = read("src/app/api/admin/trip-documents/[id]/route.ts");
  const lock = src.indexOf("idProofsOpenUntil(admin)");
  assert.ok(lock > src.indexOf('admin.role !== "admin"'), "after the admin check");
  assert.ok(lock < src.indexOf("tripApplicationDocument.findUnique"), "before the database");
  assert.ok(lock < src.indexOf("documentViewUrl(doc"), "before any link is made");
  assert.match(src, /locked: true \},\s*\{ status: 403/);
  // The unlock: the admin's own password, counted per admin, locked out after wrong ones, its cookie for these routes only.
  const unlock = read("src/app/api/admin/trip-documents/unlock/route.ts");
  for (const step of ['checkLimit("idProofUnlock", admin.id)', "beginLoginAttempt(key)", "verifyPasswordOrNothing(body.password, row?.passwordHash)", "clearLoginFailures(key)", "openIdProofs(res"]) {
    assert.ok(unlock.includes(step), step);
  }
  assert.ok(unlock.indexOf("verifyPasswordOrNothing(") < unlock.indexOf("openIdProofs(res"), "the password before the unlock");
  assert.ok(unlock.indexOf("beginLoginAttempt(key)") < unlock.indexOf("verifyPasswordOrNothing("), "the lockout before the password");
  const lockSrc = read("src/lib/server/id-proof-lock.ts");
  assert.match(lockSrc, /const COOKIE_PATH = "\/api\/admin\/trip-documents";/);
  assert.match(lockSrc, /httpOnly: true,\s*sameSite: "strict"/);
  assert.match(lockSrc, /claims\.adminId !== admin\.id \|\| claims\.tokenVersion !== admin\.tokenVersion/);
  // Signing out locks them again.
  assert.match(read("src/app/api/auth/logout/route.ts"), /lockIdProofs\(res\)/);
});

// The owner, 2026-11-04 ("showing like this how can i see"): a console tab from before the lock linked to a file
// directly, and the tab read a line of JSON. A tab that cannot have the file goes to the console's page for it.
test("a tab that cannot have the file goes to the console's page for it; a picture is only refused", () => {
  const src = read("src/app/api/admin/trip-documents/[id]/route.ts");
  assert.match(src, /const dest = req\.headers\.get\("sec-fetch-dest"\);\s*return dest \? dest === "document" : /, "a page is a document");
  assert.ok(src.includes("new URL(`/admin/id-proof/${encodeURIComponent(id)}/`, req.url), { status: 303"), "to the console's page, one path segment");
  // Signed out or locked, before the database; the picture (and anything not a page) still 401 / 403.
  assert.ok(src.includes('if (!admin || admin.role !== "admin") return opensAsPage(req) ? door() : new NextResponse("Unauthorized", { status: 401 });'));
  const lock = src.indexOf("idProofsOpenUntil(admin)");
  const lockedDoor = src.indexOf("if (opensAsPage(req)) return door();", lock);
  assert.ok(lockedDoor > lock && lockedDoor < src.indexOf("tripApplicationDocument.findUnique"), "locked: the page before the database");
  assert.match(src, /locked: true \},\s*\{ status: 403/);
  // Never for the bucket's own error, which that page would only send back here.
  assert.doesNotMatch(src.slice(src.indexOf("} catch (e)")), /door\(\)/);

  // The page is the console's (its layout lets only an admin in), names the file and whose it is, never its key.
  const page = read("src/app/admin/(console)/id-proof/[id]/page.tsx");
  assert.ok(page.includes('if (admin.role !== "admin") redirect("/");'));
  assert.ok(page.includes("<IdProofDoor fileUrl={`/api/admin/trip-documents/${doc.id}/`} />"));
  assert.doesNotMatch(page, /\{doc\.key\}|key=\{|doc\.key\s*\}/);
  // It goes on to the file only once ID proofs are open, with the console's own form until then.
  const door = read("src/components/admin/IdProofLock.tsx");
  assert.ok(door.includes('const open = useIdProofLock().state === "open";'));
  assert.ok(door.includes("if (open) window.location.replace(fileUrl);"));
  assert.ok(door.includes("return <OpenIdProofs inline />;"));
});

test("only a live employee's link gets an upload ticket", () => {
  const src = read("src/app/api/trip-applications/document-url/route.ts");
  const live = src.indexOf("liveReferralCode(body.code)");
  assert.ok(live > 0, "the link is checked");
  assert.ok(live < src.indexOf("documentUploadTarget(body.contentType, body.proof)"), "before a ticket");
});

test("the employee's own page never reads anyone's ID proof", () => {
  const page = read("src/app/employee/(workspace)/referrals/page.tsx");
  assert.doesNotMatch(page, /withDocuments|trip-documents|documents/);
  assert.match(read("src/app/admin/(console)/trip-referrals/page.tsx"), /withDocuments: true/);
});
