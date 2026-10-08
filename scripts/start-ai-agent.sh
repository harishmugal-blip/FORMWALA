#!/bin/bash
# CSC AI Agent starter/watchdog — survives crashes, auto-restarts
AI_DIR=/home/z/my-project/ai-agent
LOG=$AI_DIR/agent.log
cd "$AI_DIR" || exit 1

RUNNER="node"
command -v node >/dev/null 2>&1 || RUNNER="bun"

# Google AI Studio key (Gemini primary, z-ai fallback, circuit-breaker protected)
export GEMINI_API_KEY="${GEMINI_API_KEY:-AQ.Ab8RN6IDujVtVmeqSSz7K3s2G4Tu4pJFZJltFvcd1uZkA7vF6A}"

# kill previous agent/watchdog if any
pkill -f "agent.mjs" 2>/dev/null
pkill -f "while true; do node $AI_DIR/agent.mjs" 2>/dev/null
sleep 1

setsid nohup bash -c "while true; do GEMINI_API_KEY='$GEMINI_API_KEY' $RUNNER $AI_DIR/agent.mjs >> $LOG 2>&1; echo \"[\$(date -Is)] agent exited, restarting in 3s\" >> $LOG; sleep 3; done" < /dev/null > /dev/null 2>&1 &
disown

for i in $(seq 1 20); do
  if curl -s -m 2 http://127.0.0.1:8090/health > /dev/null 2>&1; then
    echo "AI AGENT UP on http://127.0.0.1:8090"
    curl -s http://127.0.0.1:8090/health
    echo
    exit 0
  fi
  sleep 1
done
echo "AI AGENT FAILED — last log lines:"
tail -30 "$LOG"
exit 1
