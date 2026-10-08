#!/bin/bash
# Single-pass service health check (called by n8n watchdog workflow every minute)
cd /home/z/my-project
FIXED=""
curl -s -m 5 http://127.0.0.1:8090/health > /dev/null 2>&1 || {
  pkill -f "node ai-agent/agent.mjs" 2>/dev/null; sleep 1
  setsid nohup node ai-agent/agent.mjs >> ai-agent/agent.log 2>&1 < /dev/null &
  FIXED="agent"
}
curl -s -m 5 http://127.0.0.1:8080/status > /dev/null 2>&1 || {
  pkill -f "node whatsapp-bridge/bridge.mjs" 2>/dev/null; sleep 1
  setsid nohup node whatsapp-bridge/bridge.mjs >> whatsapp-bridge/bridge.log 2>&1 < /dev/null &
  FIXED="$FIXED bridge"
}
# Next.js portal (landing + chatbot + dashboard) — port 3000
if ! curl -s -m 8 http://127.0.0.1:3000/api/catalog > /dev/null 2>&1; then
  pkill -f "next dev -p 3000" 2>/dev/null; sleep 1
  setsid nohup node node_modules/.bin/next dev -p 3000 >> dev.log 2>&1 < /dev/null &
  FIXED="$FIXED next"
fi
[ -n "$FIXED" ] && echo "[$(date +%H:%M:%S)] restarted:$FIXED" >> scripts/services-watch.log
echo "checked. fixed:${FIXED:-none}"
