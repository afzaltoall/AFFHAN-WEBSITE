// Keyframe interval / GOP of the careers hero video, without ffprobe.
//
//   node tools/audit/112-webm-keyframes.mjs [path]
//
// ffprobe is not installed and this is a report-only question, so rather than
// pull in a 70MB binary the container is read directly. WebM is Matroska: a
// tree of EBML elements, and every video frame is a SimpleBlock whose flags
// byte carries a keyframe bit (0x80). Counting those against the total, and
// reading the Cluster timecodes, gives the GOP and the interval between
// keyframes — which is the number that decides whether a scroll-scrub can
// seek smoothly.

import fs from 'node:fs';

const FILE = process.argv[2] ?? 'public/career-video/career-1-scrub.webm';
const buf = fs.readFileSync(FILE);

/** EBML ids are self-describing: the leading 1-bit marks the length. */
function readId(b, i) {
  const first = b[i];
  let len = 1;
  for (let m = 0x80; m && !(first & m); m >>= 1) len++;
  if (len > 4) return null;
  let id = 0;
  for (let k = 0; k < len; k++) id = (id << 8) | b[i + k];
  return { id: id >>> 0, len };
}

/** Sizes are vints: same length marker, then the value with the marker cleared. */
function readSize(b, i) {
  const first = b[i];
  let len = 1;
  for (let m = 0x80; m && !(first & m); m >>= 1) len++;
  if (len > 8) return null;
  let v = first & (0xff >> len);
  let unknown = v === (0xff >> len);
  for (let k = 1; k < len; k++) {
    v = v * 256 + b[i + k];
    if (b[i + k] !== 0xff) unknown = false;
  }
  return { size: unknown ? -1 : v, len };
}

const CLUSTER = 0x1f43b675;
const TIMECODE = 0xe7;
const SIMPLEBLOCK = 0xa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const TRACKS = 0x1654ae6b;

let keyframes = 0, blocks = 0;
const keyTimes = [];
let timecodeScale = 1e6; // ns per tick; Matroska default
let clusterTime = 0;

/** Walk, descending into the containers that hold what we need. */
function walk(b, start, end, depth = 0) {
  let i = start;
  while (i < end - 1) {
    const idr = readId(b, i);
    if (!idr) { i++; continue; }
    const szr = readSize(b, i + idr.len);
    if (!szr) { i++; continue; }
    const head = idr.len + szr.len;
    const size = szr.size < 0 ? end - (i + head) : szr.size;
    const body = i + head;
    const stop = Math.min(body + size, end);

    if (idr.id === SEGMENT || idr.id === INFO || idr.id === TRACKS) {
      walk(b, body, stop, depth + 1);
    } else if (idr.id === CLUSTER) {
      walk(b, body, stop, depth + 1);
    } else if (idr.id === TIMECODE) {
      let v = 0;
      for (let k = 0; k < size; k++) v = v * 256 + b[body + k];
      clusterTime = v;
    } else if (idr.id === TIMECODE_SCALE) {
      let v = 0;
      for (let k = 0; k < size; k++) v = v * 256 + b[body + k];
      timecodeScale = v;
    } else if (idr.id === SIMPLEBLOCK) {
      // track number (vint), int16 relative timecode, flags byte
      const tn = readSize(b, body);
      if (tn) {
        const off = body + tn.len;
        const rel = b.readInt16BE(off);
        const flags = b[off + 2];
        blocks++;
        if (flags & 0x80) {
          keyframes++;
          keyTimes.push(((clusterTime + rel) * timecodeScale) / 1e9);
        }
      }
    }
    i = stop;
    if (size === 0) i = body;
  }
}

walk(buf, 0, buf.length);

const bytes = buf.length;
keyTimes.sort((a, b) => a - b);
const gaps = keyTimes.slice(1).map((t, i) => t - keyTimes[i]);
const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
const max = gaps.length ? Math.max(...gaps) : 0;
const min = gaps.length ? Math.min(...gaps) : 0;
const duration = keyTimes.length ? keyTimes[keyTimes.length - 1] : 0;

console.log(`file            ${FILE}`);
console.log(`size            ${bytes.toLocaleString()} bytes (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
console.log(`frames (blocks) ${blocks}`);
console.log(`keyframes       ${keyframes}`);
console.log(`last keyframe   ${duration.toFixed(2)}s`);
if (blocks && keyframes) {
  console.log(`GOP             ${(blocks / keyframes).toFixed(1)} frames per keyframe`);
  console.log(`keyframe gap    avg ${avg.toFixed(3)}s   min ${min.toFixed(3)}s   max ${max.toFixed(3)}s`);
  console.log(`keyframe rate   ${(keyframes / (duration || 1)).toFixed(1)} per second`);
}
console.log(`\nfirst 12 keyframe times: ${keyTimes.slice(0, 12).map((t) => t.toFixed(2)).join(', ')}`);
