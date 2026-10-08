#!/bin/bash
# Activate all CSC workflows in dependency-safe order (leaves first, router last)
API="http://localhost:3000/api/v1"
KEY="X-N8N-API-KEY: n8n_api_csc-build-2026-a7f3d9e2b8c4"

ORDER=(
  3c5c0707-0000-4000-8000-000000000007  # 07 validator
  3c5c0505-0000-4000-8000-000000000005  # 05 service engine
  3c5c1111-0000-4000-8000-000000000011  # 11 pricing
  3c5c1212-0000-4000-8000-000000000012  # 12 payment init
  3c5c1414-0000-4000-8000-000000000014  # 14 application
  3c5c2020-0000-4000-8000-000000000020  # 20 notification
  3c5c2424-0000-4000-8000-000000000024  # 24 audit
  3c5c2222-0000-4000-8000-000000000022  # 22 handoff
  3c5c1919-0000-4000-8000-000000000019  # 19 status
  3c5c1818-0000-4000-8000-000000000018  # 18 submission
  3c5c1616-0000-4000-8000-000000000016  # 16 dispatcher
  3c5c1515-0000-4000-8000-000000000015  # 15 receipt
  3c5c1010-0000-4000-8000-000000000010  # 10 doc validator
  3c5c0909-0000-4000-8000-000000000009  # 09 ocr
  3c5c0808-0000-4000-8000-000000000008  # 08 docs
  3c5c0606-0000-4000-8000-000000000006  # 06 fields
  3c5c0003-0000-4000-8000-000000000002  # 02 intent
  3c5c0001-0000-4000-8000-000000000003  # 03 catalog
  3c5c0002-0000-4000-8000-000000000004  # 04 profile
  3c5c1717-0000-4000-8000-000000000017  # 17 operator
  3c5c1313-0000-4000-8000-000000000013  # 13 verifier
  3c5c2323-0000-4000-8000-000000000023  # 23 admin
  3c5c2121-0000-4000-8000-000000000021  # 21 reminders
  3c5c2525-0000-4000-8000-000000000025  # 25 research
)

for pass in 1 2 3; do
  for id in "${ORDER[@]}"; do
    r=$(curl -s -X POST -H "$KEY" "$API/workflows/$id/activate" 2>/dev/null)
    if echo "$r" | grep -q '"active":true'; then echo "active: $id"; fi
  done
done
# router last (references many)
curl -s -X POST -H "$KEY" "$API/workflows/3c5c0004-0000-4000-8000-000000000001/activate" > /dev/null 2>&1

echo "---- final status ----"
sqlite3 /home/z/.n8n/database.sqlite "SELECT COUNT(*) FROM workflow_entity WHERE name LIKE 'CSC%' AND active=1;" 2>/dev/null || \
bun -e "import { Database } from 'bun:sqlite'; const db = new Database('/home/z/.n8n/database.sqlite', {readonly:true}); console.log('ACTIVE:', db.prepare(\"SELECT COUNT(*) c FROM workflow_entity WHERE name LIKE 'CSC%' AND active=1\").get().c, '/ 25'); db.close();"
