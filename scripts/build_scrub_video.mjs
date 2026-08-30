/**
 * Re-encode a hero video so it can be scrubbed by scroll.
 *
 *   node scripts/build_scrub_video.mjs [in.mp4] [out.mp4]
 *   defaults: public/career-video/career-1.mp4 -> career-1-scrub.mp4
 *
 * Why this exists
 * ---------------
 * Seeking an ordinary web mp4 is slow. The decoder has to start at the
 * previous keyframe and run forward, and a normal encode has one every few
 * seconds — the source here had 2 keyframes across 289 frames, one every six
 * seconds. Dragging the playhead through that stutters badly, which is the
 * usual reason scroll-video demos ship a WebCodecs decoder and pull frames out
 * by hand in JavaScript.
 *
 * Encoding all-intra removes the problem at the source. Every frame is a
 * keyframe, so every seek is a direct decode of one frame and the browser's
 * own seeking is fast enough. No decoder in the bundle, nothing to fall back
 * from when WebCodecs is unavailable, and it behaves the same everywhere.
 *
 * The settings are a deliberate trade. All-intra is much larger than
 * inter-frame at the same quality, so each was chosen by measuring SSIM
 * against the source rather than by eye:
 *
 * Settings chosen by measuring SSIM against the master, not by eye:
 *
 *                       size     SSIM
 *   h264 1024 crf32     0.6MB   0.9788   soft — a 1.9x upscale at 1920
 *   h264 1600 crf26     3.1MB   0.9876   still a 1.2x upscale
 *   h264 1920 crf24     6.6MB   0.9908   native, no upscale
 *   h264 1920 crf22     9.3MB   0.9918   +2.6MB for +0.001
 *   vp9  1920 crf34     6.0MB   0.9920   <- better than h264 crf22, smaller
 *   vp9  1920 crf31     7.6MB   0.9927   matches h264 crf20 at half the size
 *
 * So both are written. VP9/WebM is listed first in the markup and every
 * current browser takes it; the H.264 mp4 is there for older iOS Safari, which
 * has never reliably decoded VP9 in WebM. Each visitor downloads one of them.
 *
 * fps stays at 15: the reader sets the pace when scrubbing, so 24 buys nothing
 * and all-intra doubles in size with it.
 */
import { execFileSync } from "node:child_process";
import { statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The master lives outside public/ on purpose: it is 12MB, nothing links to
// it, and anything under public/ is deployed and publicly fetchable. Only the
// encoded output belongs there.
const input = path.resolve(root, process.argv[2] || "media-source/career-1-source.mp4");
const output = path.resolve(root, process.argv[3] || "public/career-video/career-1-scrub.mp4");

const FPS = 15;
const WIDTH = 1920;      // native — no upscale on a 1080p display
const CRF_H264 = 24;
const CRF_VP9 = 34;      // VP9's scale differs; 34 lands above h264 crf24

if (!existsSync(input)) {
  console.error(`Source not found: ${input}`);
  process.exit(1);
}

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("ffmpeg is not on PATH. Install it, or commit the built file and skip this script.");
  process.exit(1);
}

const kb = (file) => Math.round(statSync(file).size / 1024);

const webmOutput = output.replace(/\.mp4$/, ".webm");

console.log(`Encoding ${path.basename(input)} at ${WIDTH}px, ${FPS}fps, all-intra`);

// H.264 — the fallback every browser can decode in hardware.
console.log(`  -> ${path.basename(output)}  (h264, crf ${CRF_H264})`);
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-i", input,
  "-an",                                   // the hero is muted; audio is dead weight
  "-vf", `fps=${FPS},scale=${WIDTH}:-2`,
  "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
  "-g", "1", "-keyint_min", "1", "-sc_threshold", "0",  // all-intra
  "-crf", String(CRF_H264), "-preset", "slow",
  "-movflags", "+faststart",               // metadata first, so seeking works before the file finishes
  output,
], { stdio: "inherit" });

// VP9 — smaller and sharper for everything that can take it.
console.log(`  -> ${path.basename(webmOutput)} (vp9, crf ${CRF_VP9})`);
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-i", input,
  "-an",
  "-vf", `fps=${FPS},scale=${WIDTH}:-2`,
  "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p",
  "-g", "1", "-keyint_min", "1",           // all-intra
  "-crf", String(CRF_VP9), "-b:v", "0",
  "-row-mt", "1", "-tile-columns", "2", "-speed", "1",
  webmOutput,
], { stdio: "inherit" });

// Verify rather than assume: an encode that silently kept inter-frames would
// look identical here and stutter in the browser.
const probe = execFileSync("ffprobe", [
  "-v", "error", "-select_streams", "v:0",
  "-show_entries", "frame=key_frame", "-of", "csv=p=0", output,
]).toString().trim().split("\n").filter(Boolean);

const total = probe.length;
const keyframes = probe.filter((line) => line.startsWith("1")).length;

console.log(`\n  master ${kb(input)}KB  ->  mp4 ${kb(output)}KB, webm ${kb(webmOutput)}KB`);
console.log(`  ${total} frames, ${keyframes} keyframes`);
if (total !== keyframes) {
  console.error("  NOT all-intra — scrubbing will stutter. Check the ffmpeg flags above.");
  process.exit(1);
}
console.log("  every frame is a keyframe: seeking is instant");
