// The console's theme before the first paint (2026-11-04: html.admin-dark from the choice useAdminDark keeps). Its
// script was drawn by the console's layout as a plain <script>, and React makes one in the browser on a move into the
// console from a page outside it: it is never run there, and in development React says so ("Encountered a script tag
// while rendering React component", the owner's localhost, 2026-11-22). It is drawn into the server's HTML only.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/** A source file's code, its comments taken out. */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("the console's layout draws no <script> itself: the server-only FirstPaintScript does", () => {
  const layout = read("src/app/admin/(console)/layout.tsx");
  assert.doesNotMatch(layout, /<script\b/);
  assert.match(layout, /<FirstPaintScript code=\{THEME_FIRST_PAINT\} \/>/);
  assert.match(layout, /const THEME_FIRST_PAINT = `try\{if\(localStorage\.getItem\("affhan:admin-dark"\)==="1"\)document\.documentElement\.classList\.add\("admin-dark"\)\}catch\(e\)\{\}`;/);
});

test("FirstPaintScript: drawn on the server and kept through hydration, never made in the browser", () => {
  const part = read("src/components/admin/FirstPaintScript.tsx");
  assert.match(part, /^"use client";/);
  // The server's answer (true) on the server and during hydration; the browser's (false) for anything mounted later.
  assert.match(part, /const fromServer = useSyncExternalStore\(noChanges, \(\) => false, \(\) => true\);/);
  // Fixed when first drawn, so the script hydrated in place stays, and nothing is made after.
  assert.match(part, /const \[drawn\] = useState\(fromServer\);/);
  assert.match(part, /return drawn \? <script dangerouslySetInnerHTML=\{\{ __html: code \}\} \/> : null;/);
});

test("on a move into the console the frame still sets the theme itself", () => {
  const frame = read("src/components/admin/AdminFrame.tsx");
  assert.match(frame, /document\.documentElement\.classList\.toggle\("admin-dark", readAdminDark\(\)\);/);
});
