#!/usr/bin/env bash
# Stop the local production server, rebuild, start it again, wait until ready.
#
# `prisma generate` renames query_engine-windows.dll.node, which Windows refuses
# while `next start` has it open — the EPERM in CLAUDE.md. Every variant in the
# LCP test needs a fresh build, so the stop/build/start cycle is scripted rather
# than repeated by hand.
set -e
cd "$(dirname "$0")/../.."

powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*next*start*' -or \$_.CommandLine -like '*npm-cli.js start*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" >/dev/null 2>&1 || true
sleep 2

echo "--- building ---"
npm run build > /tmp/lcp-build.log 2>&1 || { tail -30 /tmp/lcp-build.log; exit 1; }
grep -qiE "^\s*(Failed|Error)" /tmp/lcp-build.log && { tail -30 /tmp/lcp-build.log; exit 1; }
echo "build ok"

rm -f /tmp/nextstart.log
nohup npm start > /tmp/nextstart.log 2>&1 &
for i in $(seq 1 60); do
  if grep -q "Ready in" /tmp/nextstart.log 2>/dev/null; then break; fi
  sleep 1
done
grep -q "Ready in" /tmp/nextstart.log || { echo "server did not start"; cat /tmp/nextstart.log; exit 1; }

# Warm the ISR cache so the first probe run does not pay for an on-demand
# render that later runs get for free.
curl -s -o /dev/null http://localhost:3000/
echo "server ready and warmed"
