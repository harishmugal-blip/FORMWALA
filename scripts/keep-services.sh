#!/bin/bash
# CSC services watchdog — auto-restart bridge + ai-agent if they die
cd /home/z/my-project
while true; do
  curl -s -m 5 http://127.0.0.1:8090/health > /dev/null 2>&1 || {
    pkill -f "node ai-agent/agent.mjs" 2>/dev/null; sleep 1
    setsid nohup node ai-agent/agent.mjs >> ai-agent/agent.log 2>&1 < /dev/null &
    echo "[$(date +%H:%M:%S)] agent restarted" >> scripts/services-watch.log
  }
  curl -s -m 5 http://127.0.0.1:8080/status > /dev/null 2>&1 || {
    pkill -f "node whatsapp-bridge/bridge.mjs" 2>/dev/null; sleep 1
    setsid nohup node whatsapp-bridge/bridge.mjs >> whatsapp-bridge/bridge.log 2>&1 < /dev/null &
    echo "[$(date +%H:%M:%S)] bridge restarted" >> scripts/services-watch.log
  }
  # MEMORY AUTO-SAVE — har 30 min (throttle via marker file)
  MARK=/tmp/.memory-sync-last
  NOW=$(date +%s); LAST=$(cat "$MARK" 2>/dev/null || echo 0)
  if [ $((NOW - LAST)) -ge 1800 ]; then
    echo "$NOW" > "$MARK"
    bash scripts/memory-sync.sh 2>/dev/null
    echo "[$(date +%H:%M:%S)] memory synced" >> scripts/services-watch.log
  fi
  sleep 20
done
