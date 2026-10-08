#!/bin/bash
# CSC Smart Seva — start ALL services (idempotent)
# 1) n8n (port 4000)  2) WA Bridge (port 3010)  3) Admin Portal (port 3000)
LOGS=/home/z/my-project/logs
mkdir -p $LOGS

is_up() { curl -s -m 3 -o /dev/null -w "%{http_code}" "$1" 2>/dev/null; }

echo "== 1/3 n8n (port 4000) =="
if [ "$(is_up http://127.0.0.1:4000/healthz)" = "200" ]; then echo "  already running";
else bash /home/z/my-project/scripts/start-n8n.sh; sleep 12; fi

echo "== 2/3 WhatsApp Bridge (port 3010) =="
if pgrep -f "node /home/z/my-project/wa-bridge/bridge.cjs" >/dev/null || pgrep -f "node bridge.cjs" >/dev/null; then
  echo "  already running";
else
  cd /home/z/my-project/wa-bridge && (setsid nohup node bridge.cjs > $LOGS/wa-bridge.log 2>&1 < /dev/null &) && echo "  started";
fi

echo "== 3/3 Admin Portal (port 3000) =="
if [ "$(is_up http://127.0.0.1:3000/)" = "200" ]; then echo "  already running";
else
  cd /home/z/my-project && (setsid nohup npm run dev > /dev/null 2>&1 < /dev/null &) && sleep 15;
fi

echo "== status =="
echo "  n8n     : $(is_up http://127.0.0.1:4000/healthz)"
echo "  bridge  : $(is_up http://127.0.0.1:3010/status)"
echo "  portal  : $(is_up http://127.0.0.1:3000/)"
echo "  wa page : http://localhost:3000/wa-qr"
