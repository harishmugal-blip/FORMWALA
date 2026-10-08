# CSC SMART SEVA — MASTER MEMORY (SARA PLAN EK JAGAH)

> **GOLDEN RULE**: Har kaam ke baad is file ko update karo. Ye file project ki
> akela sachchai (single source of truth) he. Sandbox wipe ho jaye to bhi
> `download/csc-memory/` me iski auto-backup bani rahegi (cron har 30 min).
> Wipe ke baad: is file ko padho → `scripts/restore-everything.sh` chalao → 5 min me sab wapas.

---

## 1. PROJECT SNAPSHOT (ek nazar me)

| Cheez | Value |
|---|---|
| Project | CSC Smart Seva — WhatsApp + Web government services automation |
| Owner | harish mirza (Hinglish) |
| WhatsApp number | 917668483205 (Baileys session) |
| n8n | http://localhost:5678 — 25/25 workflows active |
| whatsapp-bridge | http://localhost:8080 (Baileys, LID routing fix) |
| ai-agent | http://localhost:8090 (Gemini brain, records brief) |
| FormBot portal | http://localhost:3000 (Next.js web chatbot) |
| DB | /home/z/my-project/db/custom.db (Prisma + better-sqlite3) |
| n8n API key | n8n_api_csc-build-2026-a7f3d9e2b8c4 |
| Watchdog | scripts/keep-services.sh (setsid nohup) |
| E2E suite | scripts/test-formbot-e2e.mjs — **41/41 PASS** |
| Memory backup | download/csc-memory/ (cron 30 min, latest + timestamped) |

**Customer ID**: `CUST-2026-XXXXX` | **Token**: `FB-YYMMDD-NNNNN`

---

## 2. ARCHITECTURE (message flow)

```
Customer WhatsApp ──> whatsapp-bridge (:8080, Baileys)
                          │ forward
                          ▼
                      ai-agent (:8090) ──> Gemini LLM (conversational brain)
                          │                 ├─ NIYAM 13 HONESTY + NIYAM 14 RECORDS
                          │                 ├─ BRIEF_RE → Customer 360° brief (LLM bypass)
                          │                 └─ n8n webhooks (CSC 01-25 workflows)
                          ▼
                      n8n (:5678) 25 workflows ──> data tables (sqlite mirror)
Customer Web ──────> FormBot portal (:3000) /api/webchat
                          ├─ webchat-engine.ts: MENU→OFFER→FIELDS→DOCS→SUMMARY→PAYMENT
                          ├─ intent.ts: matchService token-level fuzzy (0.55+0.4*coverage)
                          ├─ webchat-validators.ts: sanitizeAiReply + TEXT semantic check
                          └─ Prisma: web_chat_sessions/messages, applications, service_catalog
```

---

## 3. COMPLETED TIMELINE (17 tasks — sab ho chuka)

| # | Kaam | Status |
|---|---|---|
| 1 | n8n health check + restore (pehla wipe) | ✅ |
| 2 | Evolution API verdict → Baileys approach final | ✅ |
| 3 | lmn_sk_ token reject (scam) + REAL Baileys bridge bana | ✅ |
| 4 | 2nd wipe restore + CRITICAL LID sender bug fix | ✅ |
| 5-6 | Pairing: EJLTCR7M → user ne RZBY41CQ dala → connected | ✅ |
| 7 | LID reply routing bug fix (98320542367795@lid) | ✅ |
| 8 | AI conversational brain integrate (fixed templates hata diye) | ✅ |
| 9 | Gemini key + mid-flow agent behavior fix (CSC 06 rigid → flexible) | ✅ |
| 10 | DOCS-stage AI gate fix + restore | ✅ |
| 11 | PURA AGENT: har structural message AI-composed | ✅ |
| 12 | Real user "Hi" silent-drop root cause fix | ✅ |
| 13 | Control Panel dashboard (Next.js operator) | ✅ |
| 14 | Landing page customer chatbot (ID pehle banaye) | ✅ |
| 15 | MASTER PROMPT FormBot AI Service Assistant (38 sections) + E2E 33/33 | ✅ |
| 16 | Demo bugs fix: fuzzy matcher + AI hallucination guard + TEXT validator — E2E 37/37 | ✅ |
| 17 | Customer 360° brief (dono bots) + 6th wipe recovery + restore STEP 5 permanent fix — E2E 41/41 | ✅ |

---

## 4. ACTIVE PLAN / ROADMAP

### Ho chuka (latest polish — Task 17):
- ✅ Customer 360° brief: "aapne ab tak ye-ye banwaya / ye complete ho gaya / ye pending he / aage kya banwana chahte he"
- ✅ WhatsApp: phone → records → deterministic brief (LLM bypass, zero hallucination)
- ✅ Web: ID creation ke turant baad auto-brief + "meri jankari" intent
- ✅ restore-everything.sh STEP 5 permanent fix (import-dt-full.mjs default)

### Abbahi queue me (next up):
- [ ] (optional) Web chatbot me bhi phone-number se purane customer identify karna (abhi web sirf session-based he)
- [ ] (optional) Operator dashboard me Customer 360° panel (applications table already he)
- [ ] (optional) Daily n8n data-table → Prisma sync check (mirror drift detect)

### User-dependent (intezaar me):
- [ ] Razorpay TEST keys → milte hi LIVE wire karna (abhi payment claim honest-reject hota he)
- [ ] Operator PIN 2026 (dashboard login)
- [ ] Meta official WhatsApp API (user ke Meta business account ka wait)

---

## 5. LEARNINGS (galti + seekh — ye bhoolna nahi)

1. **Sandbox wipes AATE RAHENGE (6 ho chuke)** — my-project volume bachta he, lekin
   ~/.n8n + node_modules jata he. Isliye: restore scripts + memory backup + E2E suite.
2. **restore-everything.sh STEP 5** me ab import-dt-full.mjs + fix-dt-ids.mjs default he
   (REST API path hamesha fail hota tha).
3. **Watchdog OLD code wala process wapas la sakta he** — code change ke baad
   `pkill -f "node ai-agent/agent.mjs"` + bash wrapper bhi + `source` field se verify.
4. **AI kabhi completion claim na kare** — 3-layer guard: NIYAM 13/14 prompt +
   sanitizeAiReply() FAKE_CLAIM_RE + deterministic MENU confirm guard.
5. **Fuzzy matching token-level pe karo** (normalized joined strings nahi) —
   "mujhemoolniwasbananahai" bug.
6. **TEXT field validation semantic** — looksLikeDate || (0 letters + 3+ digits) → reject.
7. **n8n mirrored rows me quotes** — har read pe unq strip.
8. **Test phone 11-digit malformed mat karo**; agent port pe purana process check karo.
9. **lmn_sk_ type tokens = scam** — kisi ko credentials mat dena.
10. **extracted script runs me header vars (P, log) manually** add karne padte hein.

---

## 6. WIPE RECOVERY GUIDE (5 minute)

```bash
# 1. Restore sab kuch (n8n + workflows + creds + data tables + activate + AI fixes)
bash /home/z/my-project/scripts/restore-everything.sh

# 2. Services check + portal restart agar chahiye
bash /home/z/my-project/scripts/services-check.sh

# 3. Bridge agar session gaya: pairing code lo
curl -X POST http://localhost:8080/pair/917668483205

# 4. E2E verify (41 assertions)
node /home/z/my-project/scripts/test-formbot-e2e.mjs

# 5. Memory file wapas check karo
ls /home/z/my-project/download/csc-memory/
```

Watchdog khud sab upar wale ko start karta rahega: `scripts/keep-services.sh`

---

## 7. FILE MAP (kahan kya he)

| Path | Kya he |
|---|---|
| src/lib/webchat-engine.ts | Web chatbot state machine (MENU→…→PAYMENT) |
| src/lib/intent.ts | matchService fuzzy + intents (BRIEF_RE etc.) |
| src/lib/webchat-validators.ts | sanitizeAiReply + field validators |
| ai-agent/agent.mjs | WhatsApp brain (Gemini, records brief, NIYAM) |
| mini-services/whatsapp-bridge/ | Baileys bridge (:8080) |
| prisma/schema.prisma | DB schema (custom.db) |
| scripts/restore-everything.sh | 1-command full restore |
| scripts/keep-services.sh | Watchdog |
| scripts/test-formbot-e2e.mjs | E2E 41/41 |
| download/csc-service-catalog.json | Service catalog source |
| download/backup-formbot-20261006/ | FormBot code backup |
| download/csc-memory/ | **MEMORY auto-backup (cron)** |
| worklog.md | Detailed per-task work log |

---

*Last updated: 2026-10-08 — Task 18 (Memory System) ke saath.*
