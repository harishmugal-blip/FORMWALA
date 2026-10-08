#!/bin/bash
# CSC WhatsApp Bridge starter/watchdog — survives crashes, auto-restarts
BRIDGE_DIR=/home/z/my-project/whatsapp-bridge
LOG=$BRIDGE_DIR/bridge.log
cd "$BRIDGE_DIR" || exit 1

# node preferred: bun's ws.WebSocket misses 'upgrade'/'unexpected-response'
# events that Baileys relies on — node 24 has the complete ws implementation.
RUNNER="node"
command -v node >/dev/null 2>&1 || RUNNER="bun"

# kill previous bridge/watchdog if any
pkill -f "bridge.mjs" 2>/dev/null
sleep 1

setsid nohup bash -c "while true; do $RUNNER $BRIDGE_DIR/bridge.mjs >> $LOG 2>&1; echo \"[\$(date -Is)] bridge exited, restarting in 3s\" >> $LOG; sleep 3; done" < /dev/null > /dev/null 2>&1 &
disown

for i in $(seq 1 30); do
  if curl -s -m 2 http://127.0.0.1:8080/status > /dev/null 2>&1; then
    echo "BRIDGE UP on http://127.0.0.1:8080"
    curl -s http://127.0.0.1:8080/status
    echo
    exit 0
  fi
  sleep 1
done
echo "BRIDGE FAILED — last log lines:"
tail -40 "$LOG"
exit 1
