// The lucky draw's sound (src/components/lucky-draw/wall/sound.ts): every file it plays is in public/, each at a level
// that never clips, and nothing plays before someone presses on the page.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { SOUND_FILES, SOUND_LEVEL, SOUND_PEAK } from "@/components/lucky-draw/wall/sound";

test("every sound the draw plays is a file in public/, small, an MP3", () => {
  for (const [name, path] of Object.entries(SOUND_FILES)) {
    const file = `public${path}`;
    assert.ok(existsSync(file), `${name}: ${file} is there`);
    const size = statSync(file).size;
    assert.ok(size > 1000 && size < 1_000_000, `${name}: ${size} bytes`);
    const head = readFileSync(file).subarray(0, 3);
    assert.ok(head.toString("latin1") === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), `${name}: an MP3`);
  }
});

test("each sound has its level, and at its loudest none goes past full (it would crackle)", () => {
  assert.deepEqual(Object.keys(SOUND_LEVEL).sort(), Object.keys(SOUND_FILES).sort());
  assert.deepEqual(Object.keys(SOUND_PEAK).sort(), Object.keys(SOUND_FILES).sort());
  for (const [name, level] of Object.entries(SOUND_LEVEL)) assert.ok(level > 0 && level * SOUND_PEAK[name] <= 0.9, `${name}: ${level} x ${SOUND_PEAK[name]}`);
});

test("the stage cues them only through the screen's sound, which starts on a press on the page", () => {
  const stage = readFileSync("src/components/lucky-draw/wall/stage.ts", "utf8");
  const wall = readFileSync("src/components/lucky-draw/wall/DrawWall.tsx", "utf8");
  const sound = readFileSync("src/components/lucky-draw/wall/sound.ts", "utf8");
  assert.doesNotMatch(stage, /new (Audio|AudioContext)\b/, "the stage makes no sound of its own");
  assert.match(sound, /if \(!ctx \|\| !this\.master \|\| !buffer \|\| ctx\.state !== "running"\) return null;/, "nothing plays before the browser lets it");
  assert.match(wall, /onPointerDown=\{\(\) => \{\s*sound\?\.unlock\(\);/, "a press anywhere on the screen starts it");
  assert.match(wall, /e\.key === "m" \|\| e\.key === "M"/, "M mutes it");
});
