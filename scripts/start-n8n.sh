#!/bin/bash
# CSC n8n starter - restores environment after session reset
cd /home/z/my-project/n8n

export N8N_PORT=5678
export N8N_HOST=localhost
export N8N_ENCRYPTION_KEY="csc-n8n-encryption-2026"
export N8N_RUNNERS_ENABLED=true
export N8N_DIAGNOSTICS_ENABLED=false
export N8N_VERSION_NOTIFICATIONS_ENABLED=false
export N8N_TEMPLATES_ENABLED=false
export WEBHOOK_URL=http://localhost:5678/
export N8N_API_ENABLED=true
export N8N_API_KEY_AUTH_ACTIVE=true

# Kill any stale n8n
pkill -f "n8n start" 2>/dev/null
sleep 2

setsid nohup ./node_modules/.bin/n8n start > /home/z/my-project/n8n/n8n.log 2>&1 < /dev/null &
N8N_PID=$!
echo "Started PID: $N8N_PID"

# Poll health up to 120s
for i in $(seq 1 40); do
  sleep 3
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5678/healthz 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    echo "n8n HEALTHY after $((i*3))s"
    exit 0
  fi
  if ! ps -p $N8N_PID > /dev/null 2>&1; then
    echo "PROCESS DIED at $((i*3))s. Log tail:"
    tail -20 /home/z/my-project/n8n/n8n.log
    exit 1
  fi
done
echo "TIMEOUT waiting for health. Log tail:"
tail -20 /home/z/my-project/n8n/n8n.log
exit 1
