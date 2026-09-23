#!/usr/bin/env bash
# One labelled measurement round against the local production build.
#
#   bash tools/audit/70-measure.sh <label>
#
# Lighthouse runs with --throttling-method=devtools (APPLIED throttling), not
# the default `simulate`. That distinction is the whole point: the simulated run
# reported a 6.2s LCP against an observed 939ms, and it scored the page 76 while
# hiding the failure the user actually sees. Applied throttling reproduces it —
# TBT and TTI come back null with NO_TTI_CPU_IDLE_PERIOD, which is GTmetrix's
# "The page took too long to load (No CPU idle period)" verbatim.
#
# So `cpuIdle` below, not `score`, is the number that says whether this is fixed.
set -u
LABEL="${1:?usage: 70-measure.sh <label>}"
URL="${URL:-http://localhost:3000/}"
OUT="tools/audit/out"
mkdir -p "$OUT"
# Warm the server first. The page is ISR (revalidate = 3600), so the very first
# request after a restart renders it from scratch and Next is still warming its
# own caches - measuring that instead of steady state made a run look 67% worse
# than its own baseline for a change that provably removed work.
for _ in 1 2 3; do curl -s -o /dev/null "$URL"; done
sleep 2

export CHROME_PATH="${CHROME_PATH:-C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"

npx --yes lighthouse@12 "$URL" \
  --only-categories=performance \
  --throttling-method=devtools \
  --form-factor=mobile --screenEmulation.mobile \
  --output=json --output-path="$OUT/lh-$LABEL.json" \
  --chrome-flags="--headless=new --no-first-run --no-default-browser-check" \
  --quiet >/dev/null 2>&1

node -e '
const fs = require("fs");
const label = process.argv[1];
const lh = JSON.parse(fs.readFileSync(`tools/audit/out/lh-${label}.json`, "utf8"));
const a = lh.audits, d = a.diagnostics.details.items[0];
const doc = (a["network-requests"].details.items || []).find((i) => i.resourceType === "Document");
const num = (k) => (a[k] && a[k].numericValue != null ? Math.round(a[k].numericValue) : null);
const out = {
  label,
  method: lh.configSettings.throttlingMethod,
  // null when the CPU-idle failure zeroes the run.
  cpuIdle: a.interactive.errorMessage
    ? "FAIL:" + ((a.interactive.errorMessage.match(/\(([A-Z_]+)\)/) || [])[1] || "?")
    : "ok",
  score: Math.round(lh.categories.performance.score * 100),
  fcp: num("first-contentful-paint"),
  lcp: num("largest-contentful-paint"),
  tbt: num("total-blocking-time"),
  tti: num("interactive"),
  si: num("speed-index"),
  cls: +a["cumulative-layout-shift"].numericValue.toFixed(3),
  totalTaskTime: Math.round(d.totalTaskTime),
  numTasks: d.numTasks,
  over50ms: d.numTasksOver50ms,
  bytes: d.totalByteWeight,
  docBytes: doc ? doc.resourceSize : null,
  requests: d.numRequests,
};
fs.writeFileSync(`tools/audit/out/sum-${label}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
' "$LABEL"
