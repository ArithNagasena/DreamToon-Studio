#!/usr/bin/env bash
# Full verification: fresh server per suite so neither can pollute the other.
set -u
boot() {
  pkill -f "node src/index.js" 2>/dev/null; sleep 1
  (cd "$(dirname "$0")"/server && DEV_MEMORY_DB=1 SEED=1 PORT=4000 setsid nohup node src/index.js > /tmp/srv.log 2>&1 < /dev/null &)
  for i in $(seq 1 20); do
    curl -sf localhost:4000/api/health > /dev/null 2>&1 && return 0
    sleep 0.5
  done
  echo "server failed to boot"; cat /tmp/srv.log; exit 1
}
echo "=============================================="
echo " API suite  (Express + repository layer)"
echo "=============================================="
boot; bash "$(dirname "$0")"/apitest.sh
echo ""
echo "=============================================="
echo " End-to-end suite  (real Chromium, full stack)"
echo "=============================================="
boot; node "$(dirname "$0")"/e2e.mjs
