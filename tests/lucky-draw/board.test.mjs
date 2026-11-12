// The departures board the winner's ticket checks in to (src/components/lucky-draw/wall/board.ts): its rows, and that
// every flap starts blank, clatters, and settles on its own letter before the boarding pass prints.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_COLS_MAX,
  BOARD_FLAPS_AT,
  BOARD_PRINT_AT,
  BOARD_SETTLED_BY,
  FLAP_T,
  boardRows,
  flapAt,
  flapSequence,
  letterTimes,
} from "@/components/lucky-draw/wall/board";

const card = (name, city = "Tirunelveli", country = "India", tripId = "TRIP-26-02413") => ({ tripId, name, city, country });

test("the board's rows: the flight, the passenger, from, to China, and WINNER in gold", () => {
  const rows = boardRows(card("Mani Krishnan"));
  assert.deepEqual(
    rows.map((r) => [r.label, r.text, !!r.gold]),
    [
      ["FLIGHT", "TRIP-26-02413", false],
      ["PASSENGER", "MANI KRISHNAN", false],
      ["FROM", "TIRUNELVELI, INDIA", false],
      ["TO", "CHINA", false],
      ["STATUS", "WINNER", true],
    ],
  );
  assert.equal(boardRows(card("Lim", "Singapore", "Singapore"))[2].text, "SINGAPORE", "a city that is its own country, once");
});

test("a long name goes on two or three rows, broken at spaces, never inside a word, never cut; nothing wider than the board", () => {
  for (const [name, n] of [
    ["Abdul Rahman Sheik Dawood Ibrahim Mohamed Ali", 2],
    ["Mohommed Safardeen Mohommed Inshaf", 2],
    ["Soundarapandiyan Thirumurugan Ramasubramaniam", 3],
  ]) {
    const parts = boardRows(card(name)).filter((r) => r.label === "PASSENGER" || r.label === "");
    assert.equal(parts.length, n, `${name}: ${n} rows`);
    assert.equal(parts.map((r) => r.text).join(" "), name.toUpperCase(), `${name}: every word kept, in order`);
    for (const r of parts) assert.ok(r.text.length <= BOARD_COLS_MAX);
  }
  for (const r of boardRows(card("A".repeat(40), "B".repeat(40), "C"))) assert.ok(r.text.length <= BOARD_COLS_MAX, `${r.label}: ${r.text.length} letters`);
  assert.equal(boardRows(card("Harish")).filter((r) => r.label === "PASSENGER").length, 1);
});

test("every flap starts blank, clatters a letter a fall, and settles on its own letter before the pass prints", () => {
  let x = 7;
  const rnd = () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
  let latest = 0;
  // The longest boards there can be: names on three rows, places as wide as the board; every flap of each, its own
  // letters and the blank ones after them.
  const longest = [
    card("Soundarapandiyan Thirumurugan Ramasubramaniam", "Ramanathapuram District Tamil", "India"),
    card("Abdul Rahman Sheik Dawood Ibrahim Mohamed Ali", "Grandpass Colombo Fourteen", "Sri Lanka"),
    card("Kuralarasan K V", "Chennai", "India"),
  ];
  for (const rows of longest.map((c) => boardRows(c))) {
    const cols = Math.min(BOARD_COLS_MAX, Math.max(16, ...rows.map((r) => r.text.length)));
    for (let row = 0; row < rows.length; row++) {
      for (let k = 0; k < cols; k++) {
        const letter = k < rows[row].text.length;
        const { spin, settle } = letterTimes(row, k, 0.999, letter);
        latest = Math.max(latest, settle);
        assert.ok(spin >= BOARD_FLAPS_AT, "nothing spins before the board is up");
        const target = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-,"[k % 38];
        const seq = flapSequence(target, spin, settle, rnd);
        assert.equal(seq[0], " ", "blank first");
        assert.equal(seq[seq.length - 1], target, "its own letter last");
        assert.ok(Math.abs(spin + (seq.length - 1) * FLAP_T - settle) < 1e-9, "one letter a fall");
        assert.deepEqual(flapAt(seq, spin, spin - 0.01), { from: " ", to: " ", p: 1 }, "still and blank before it spins");
        assert.deepEqual(flapAt(seq, spin, settle + 0.001), { from: target, to: target, p: 1 }, "still on its letter once settled");
        if (seq.length > 2) {
          const mid = flapAt(seq, spin, spin + FLAP_T * 1.5);
          assert.ok(mid.p > 0.4 && mid.p < 0.6, "half way through its second fall");
        }
      }
    }
  }
  assert.ok(latest <= BOARD_SETTLED_BY + 1e-9, `every letter settled by ${BOARD_SETTLED_BY} s (the last at ${latest.toFixed(2)} s)`);
  assert.ok(BOARD_PRINT_AT - BOARD_SETTLED_BY >= 1, "the whole board is read for a second before the pass prints");
  // Left to right: each letter starts after the one before it.
  assert.ok(letterTimes(2, 5, 0.5).spin < letterTimes(2, 6, 0.5).spin && letterTimes(1, 0, 0.5).spin < letterTimes(2, 0, 0.5).spin);
});
