// Deleting a supplier or an application takes their photos out of the bucket (src/lib/video-storage.ts,
// 2026-10-22). Only keys the upload route could have issued may ever be named: suppliers/<uuid>.<jpg|png|webp>
// under our own CDN address. Anything else a row might hold is left alone, and costs no S3 call.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.test";
const { supplierPhotoKey, removeSupplierPhotos } = await import("../../src/lib/video-storage.ts");

const ID = "0b3c2f4e-8d1a-4c5b-9e7f-112233445566";

test("a photo the upload route issued is its key under suppliers/", () => {
  assert.equal(supplierPhotoKey(`https://cdn.test/suppliers/${ID}.jpg`), `suppliers/${ID}.jpg`);
  assert.equal(supplierPhotoKey(`https://cdn.test/suppliers/${ID}.webp`), `suppliers/${ID}.webp`);
});

test("anything else names no key", () => {
  for (const url of [
    `https://cdn.test/videos/source/${ID}.mp4`,
    `https://cdn.test/employees/${ID}.jpg`,
    `https://evil.example/suppliers/${ID}.jpg`,
    `https://cdn.test/suppliers/../videos/${ID}.jpg`,
    `https://cdn.test/suppliers/${ID}.jpg/extra`,
    `https://cdn.test/suppliers/not-a-uuid.jpg`,
    `https://cdn.test/suppliers/${ID}.gif`,
    `https://cdn.test/${ID}.jpg`,
    "",
  ]) {
    assert.equal(supplierPhotoKey(url), null, url);
  }
});

test("removing photos that are not ours deletes nothing and calls nothing", async () => {
  assert.equal(await removeSupplierPhotos(["https://evil.example/x.jpg", `https://cdn.test/videos/source/${ID}.mp4`]), 0);
});
