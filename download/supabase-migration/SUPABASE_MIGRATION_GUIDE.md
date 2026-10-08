# CSC Smart Seva — Supabase Migration Guide

**Goal:** n8n ko Supabase PostgreSQL database ke saath chalana (Data Tables + executions sab Postgres me store honge, workflows me ZERO change).

---

## Samajh pehle (Architecture)

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│  n8n app (25 CSC workflows) │──────▶ │  Supabase PostgreSQL (Mumbai)    │
│  KAHAN chalta hai?          │        │  - 22 data tables (237 rows)     │
│  ▸ VPS  (₹400-500/month)    │        │  - workflows, credentials        │
│  ▸ ya apna PC (free)        │        │  - execution history             │
│  Public URL chahiye webhook │        │  Supabase UI me data dikhega     │
└─────────────────────────────┘        └──────────────────────────────────┘
```

**IMPORTANT:** Supabase sirf DATABASE host karta hai — n8n app khud Supabase pe NAHI chalta.
n8n ko alag jagah chalana hoga (VPS ya apna PC). Supabase uska database banega.

---

## STEP 1 — Supabase project banao (5 min)

1. https://supabase.com → Sign up → **New project**
2. Name: `csc-smart-seva` | Region: **Mumbai (ap-south-1)** ← India ke liye best latency
3. Database password set karo (strong, save kar lena)
4. Project ready hone ke 2-3 min do

**Connection details lo:** Project → Settings (⚙) → Database →
**"Connection string" → URI** section me `Session pooler` select karo.

Aisa dikhega:
```
postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Isme se 4 cheezein note karo: HOST, USER, PASSWORD, DATABASE(=postgres).

---

## STEP 2 — n8n install karo (VPS ya PC pe)

### Option A: VPS (recommended — 24/7 rahega)
- DigitalOcean / Hetzner / Hostinger — ₹400-600/month, 2GB RAM minimum
- Ubuntu 24.04 droplet, Mumbai/India region
- Neeche wale commands chalao:

```bash
# 1. bun install (2 GB RAM me npm OOM ho jata hai, bun use karo)
curl -fsSL https://bun.sh/install | bash

# 2. folder banao
mkdir -p /opt/csc-n8n && cd /opt/csc-n8n
bun add n8n@2.40.7

# 3. start script banao (STEP 3 me env vars ke saath)
```

### Option B: Apna PC (free, lekin PC on rehna chahiye)
```bash
mkdir -p ~/csc-n8n && cd ~/csc-n8n
bun add n8n@2.40.7
```
Public URL ke liye Cloudflare Tunnel (free):
```bash
cloudflared tunnel --url http://localhost:3000
```
Ye ek `https://xxxx.trycloudflare.com` URL dega — yahi Meta webhook URL banega.

---

## STEP 3 — n8n ko Supabase se jodo

Start script me ye environment variables set karo:

```bash
#!/bin/bash
# /opt/csc-n8n/start.sh  (ya ~/csc-n8n/start.sh)

export N8N_PORT=3000
export N8N_SECURE_COOKIE=false

# ===== SUPABASE POSTGRES =====
export DB_TYPE=postgresdb
export DB_POSTGRESDB_HOST=aws-0-ap-south-1.pooler.supabase.com   # apna HOST dalo
export DB_POSTGRESDB_PORT=5432
export DB_POSTGRESDB_DATABASE=postgres
export DB_POSTGRESDB_USER=postgres.abcdefgh                      # apna USER dalo
export DB_POSTGRESDB_PASSWORD=APNA_SUPABASE_PASSWORD             # apna PASSWORD dalo
export DB_POSTGRESDB_SCHEMA=public
export DB_POSTGRESDB_SSL_ENABLED=true

# ===== production hygiene (500MB free tier safe) =====
export EXECUTIONS_DATA_PRUNE=true
export EXECUTIONS_DATA_MAX_AGE=168          # 7 din baad executions auto-delete
export EXECUTIONS_DATA_SAVE_ON_SUCCESS=none # successful runs save mat karo (errors save honge)

# ===== webhook + security =====
export N8N_ENCRYPTION_KEY=local-dev-n8n-key-2026   # same key = credentials decrypt honge
export WEBHOOK_URL=https://YOUR-PUBLIC-URL/        # VPS domain ya cloudflare tunnel URL
export N8N_HOST=YOUR-PUBLIC-HOST
export GENERIC_TIMEZONE=Asia/Kolkata
export TZ=Asia/Kolkata

/opt/csc-n8n/node_modules/.bin/n8n start
```

**Pehli baar chalane pe n8n khud Supabase me apne saare tables bana dega.**
Supabase UI → Table Editor me jaake dekho — tables aa gaye honge. ✅

---

## STEP 4 — Workflows + Credentials wapas lao (10 min)

Backup files isi folder me hain:
- `workflows-backup.json` — 26 workflows (25 CSC + helpers)
- `credentials-backup.json` — Gemini + OpenRouter keys (⚠️ SENSITIVE — public me share mat karna)
- `datatables-backup.json` — 22 tables, 237 rows (14 services ki config + data)

### 4a. Credentials import
```bash
# n8n band ho to pehle chala do, phir dusre terminal se:
/opt/csc-n8n/node_modules/.bin/n8n import:credentials \
  --input=credentials-backup.json

# Phir n8n UI me ek baar APNI E-MAIL se owner account banao
# aur Settings → Projects me credentials ko assign/share karo.
```
> Encryption key same rakhi hai (`local-dev-n8n-key-2026`), isliye credentials
> import ke turant kaam karenge. Naya key lagaya to credentials dobara
> khologe aur keys paste karne padenge — 2 min ka kaam hai.

### 4b. Workflows import
```bash
/opt/csc-n8n/node_modules/.bin/n8n import:workflow \
  --input=workflows-backup.json
```

### 4c. Data Tables import (schema + rows)
```bash
# import-datatables.js file new instance ke liye edit karo:
#   N8N_API_KEY  → new n8n ka API key (UI → Settings → n8n API)
#   N8N_BASE_URL → http://localhost:3000/api/v1

bun import-datatables.js
```
Script khud: tables banayega → columns set karega → 237 rows daalega →
end me summary count dega.

### 4d. Activate order (IMPORTANT — pehle sub-workflows, callers baad me)
```bash
# UI me manually ya CLI se, IS ORDER me Activate karo:
# CSC 03, 04, 05, 07, 09, 10, 11, 14, 15, 17, 18, 19, 20, 21, 22, 24, 25  (sub-workflows)
# phir: CSC 02, 06, 08, 12, 13, 16, 23                                     (callers)
# SABSE LAST: CSC 01 (main router)
```

---

## STEP 5 — WhatsApp + Razorpay abhi real karo

Workflows chalu hone ke baad **system_config** table me (Supabase UI se ya n8n Data Tables UI se):

| config_key | value |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta se mila phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | Meta permanent system-user token |
| `RAZORPAY_KEY_ID` | rzp_test_xxx (pehle test) |
| `RAZORPAY_KEY_SECRET` | test secret |
| `PAYMENT_MODE` | `RAZORPAY_TEST` |

**Meta webhook URL** (Meta App Dashboard → WhatsApp → Configuration):
```
https://YOUR-PUBLIC-URL/webhook/whatsapp
Verify token: csc_verify_2026
```

**Razorpay webhook URL:**
```
https://YOUR-PUBLIC-URL/webhook/payment-verify
```

---

## ⚠️ Supabase Free Tier — 3 dhyan rakhne wali baatein

1. **7 din inactivity pe project PAUSE ho jata hai.** Customers active rahenge to
   issue nahi (n8n roz DB likhta hai). Slow period me pehle hi ek baar koi test
   message bhej dena, ya Supabase UI me "Restore" kar dena.
2. **500 MB limit.** Execution pruning ON kar diya hai (STEP 3) — data chhota rahega.
   Aise 1-2 saal chal jayega.
3. **Production seriousness** = ₹25/month Pro plan kabhi le sakte ho (pause nahi hota).
   Ya alternate: VPS pe hi PostgreSQL khud chalao, Supabase skip karo.

---

## ✅ Migration ke baad ka checklist

- [ ] Supabase Table Editor me `service_catalog` me 14 rows dikh rahe hain
- [ ] CSC 01 webhook pe ek test message bheja → response aaya
- [ ] Meta webhook verified (green tick in Meta dashboard)
- [ ] Razorpay test payment flow chala
- [ ] Operator WhatsApp number pe admin digest aaya (8PM IST)
- [ ] Sandboxed n8n band kar diya / ya backup ke liye rakh diya

**Backup files kabhi delete mat karna** — yahi tumhara full-system snapshot hai.
