/**
 * Camera capture for the Android app, with no cost to the website.
 *
 * The Android build (see the AFFHAN-ANDROID repo) is a Capacitor shell that
 * loads this site over HTTPS rather than bundling it, so the same JavaScript
 * serves browsers and the app. That makes the size of anything added here a
 * real concern: 99.9% of the traffic is browsers that will never have a native
 * bridge to talk to.
 *
 * So this file deliberately does NOT import @capacitor/camera. Capacitor
 * injects its bridge into the page and exposes every plugin registered in the
 * native project on `window.Capacitor.Plugins`, which is enough to call the
 * plugin directly. The npm wrapper would add a dependency, a bundle entry and
 * a build step to the website in exchange for types we can write ourselves in
 * twenty lines.
 *
 * Every function here is safe to call in a browser. `isNativeApp()` is false,
 * `capturePhoto()` throws CameraUnavailable, and the caller falls back to the
 * file input it already had.
 */

/** Thrown when there is no native camera to reach. Callers should fall back. */
export class CameraUnavailable extends Error {
  constructor() {
    super("No native camera bridge on this platform.");
    this.name = "CameraUnavailable";
  }
}

/** Thrown when the user backed out of the camera. Not an error to report. */
export class CameraCancelled extends Error {
  constructor() {
    super("Capture cancelled.");
    this.name = "CameraCancelled";
  }
}

type CapacitorPhoto = { base64String?: string; format?: string };

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    Camera?: {
      getPhoto: (options: Record<string, unknown>) => Promise<CapacitorPhoto>;
      checkPermissions?: () => Promise<{ camera?: string }>;
      requestPermissions?: (o?: Record<string, unknown>) => Promise<{ camera?: string }>;
    };
  };
};

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

/** True only inside the packaged app. False in every browser, including on a
 *  phone — a mobile browser has no bridge and must keep using the file input. */
export function isNativeApp(): boolean {
  return bridge()?.isNativePlatform?.() === true;
}

/**
 * True when a photo can actually be captured.
 *
 * Deliberately stricter than isNativeApp(): an older build of the app that
 * predates the camera plugin still reports itself as native, and calling
 * getPhoto there would reject with an opaque bridge error. Because the shell
 * loads this site live, that combination is not hypothetical — the moment this
 * ships, every already-installed copy of the app is running it.
 */
export function hasNativeCamera(): boolean {
  return isNativeApp() && typeof bridge()?.Plugins?.Camera?.getPhoto === "function";
}

/** Base64 to File, without a round trip through fetch() or a data: URL. */
function toFile(base64: string, format: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const ext = format === "png" ? "png" : format === "webp" ? "webp" : "jpg";
  const type = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return new File([bytes], `camera-${Date.now()}.${ext}`, { type });
}

/** Capacitor reports a cancelled capture as a rejection, not an empty result,
 *  and the wording differs between the picker and the camera. Matching on the
 *  text is unpleasant but it is what the bridge gives us, and the consequence
 *  of getting it wrong is only ever a needless error message. */
function looksCancelled(message: string): boolean {
  return /cancel|no image (picked|selected)|user denied/i.test(message);
}

/**
 * Open the device camera and return the photo as a File.
 *
 * The File is the point: the existing upload path takes one from paste, drop
 * and the file input alike, so a captured photo joins at exactly the same
 * place and inherits the size and type checks already written for it.
 */
export async function capturePhoto(): Promise<File> {
  const camera = bridge()?.Plugins?.Camera;
  if (!camera) throw new CameraUnavailable();

  try {
    const photo = await camera.getPhoto({
      // A vision model reading a product photo gains nothing from 12
      // megapixels, and the upload is capped at 5MB. 1600px wide at quality
      // 80 lands around 300-500KB on this phone's camera.
      quality: 80,
      width: 1600,
      correctOrientation: true,

      // 'CAMERA', not 'PROMPT'. PROMPT offers "camera or gallery", and the
      // gallery half would need READ_MEDIA_IMAGES — permission to read the
      // user's entire photo library to do something the page's own file input
      // already does with none. The gallery route stays in the web layer.
      source: "CAMERA",

      // Base64 rather than a file:// URI: the URI form needs
      // convertFileSrc() plus a fetch to read the bytes back, and on Android
      // that read is what trips over scoped storage. Base64 costs memory for
      // one photo and nothing else.
      resultType: "base64",

      allowEditing: false,
      saveToGallery: false,
    });

    if (!photo?.base64String) throw new CameraCancelled();
    return toFile(photo.base64String, (photo.format || "jpeg").toLowerCase());
  } catch (err) {
    if (err instanceof CameraCancelled) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (looksCancelled(message)) throw new CameraCancelled();
    throw err;
  }
}
