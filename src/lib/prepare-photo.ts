/**
 * Make any photo fit to be a staff picture before it leaves the browser.
 *
 * The upload policy caps a staff photo at 8MB and the office's photos come
 * straight off phone cameras, which is 3–12MB and often more — so the common
 * case was being refused by S3 with "try a smaller image", which is advice
 * nobody at a desk can act on. A profile picture is shown at 96px at most; 800px
 * on the long edge is more than it will ever need. So the photo is decoded,
 * turned the right way up (phones store rotation as metadata), scaled down and
 * re-encoded as a JPEG here, and what goes to S3 is a file of a few hundred KB
 * whatever was chosen. The upload is faster too, and the storage stays small.
 *
 * Whatever the browser can decode is accepted, not just the three types the
 * server allows, because the output is always a JPEG. What it cannot decode —
 * an iPhone's HEIC on most desktop browsers — gets a message that says what to
 * do about it.
 */
export const PHOTO_MAX_EDGE = 800;
const QUALITY = 0.85;

export async function preparePhoto(file: File): Promise<File> {
  const looksLikeImage =
    file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i.test(file.name);
  if (!looksLikeImage) throw new Error("Choose a photo — a JPEG, PNG or WebP picture.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      /\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type)
        ? "This browser can't open iPhone HEIC photos. Save it as a JPEG (or take a screenshot of it) and choose that."
        : "That file couldn't be opened as a picture. Choose a JPEG, PNG or WebP photo."
    );
  }

  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Couldn't prepare the photo. Try again.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // A JPEG has no transparency: a see-through PNG would otherwise come out on
  // black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Couldn't prepare the photo. Try again.");
  const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
  return new File([blob], name, { type: "image/jpeg" });
}
