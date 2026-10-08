# CSC Smart Seva — n8n WhatsApp Automation
## Complete Build Guide (Saare 11 Phases) ✅

> Status: **25/25 workflows ACTIVE + 22 data tables + end-to-end TESTED**
> Harish bhai, poora system ready hai — neeche sab kuch detail mein hai.

---

## 🏗️ Architecture (25 Workflows)

```
Customer WhatsApp Message
        │
        ▼
[CSC 01 - WhatsApp Main Router v2]  ◄── single entry point (webhook/whatsapp)
        │ state-aware routing (NO AI needed for ongoing conversations!)
        ├─────────────► [CSC 02 AI Intent] ──► [CSC 03 Catalog] ──► [CSC 25 Unknown Research]
        │                                            │
        │              "pan card banana hai" ────────┘ (service + fee + CONFIRM)
        ├── CONFIRM ──► [CSC 04 Profile] ──► [CSC 05 SERVICE ENGINE] ──► [CSC 06 Field Collector]
        │                                                                        │ 7 sawal + [CSC 07 Validator]
        │                                                                        ▼
        ├─ media ──────► [CSC 08 Document Collector] ──► [CSC 09 OCR] ──► [CSC 10 Doc Validator]
        │                                                                        │ docs complete?
        │                                                                        ▼
        │                                              [CSC 11 Pricing] ──► [CSC 12 Payment Link]
        │                                                                        │
        │         Razorpay Webhook (HMAC verified!) ──► [CSC 13 Payment Verifier]
        │                                                                        │
        │                        [CSC 14 Application Engine] ◄───────────────────┘
        │                              │ CSC-2026-XXXXXX number generate
        │                              ▼
        │                [CSC 15 Receipt] ──► [CSC 16 Operator Dispatch] ──► [CSC 20 Notification Engine]
        │
        ├── STATUS ────► [CSC 19 Status Engine]
        ├── HUMAN ─────► [CSC 22 Human Handoff] (bot PAUSE, operator ko alert)
        │
Operator (Admin Number)
        │
        ▼
[CSC 17 Operator Portal Assistant]  ◄── DONE / ISSUE / QUEUE / PAID / RESUME commands
        │
        ▼
[CSC 18 Submission Confirmer] ──► customer notification + state clear
```

**Background engines:**
- **CSC 20** — Notification Engine (saari outbound WhatsApp messages ka central hub)
- **CSC 21** — Reminder Engine (roz 9/15/21 baje, max 3 reminder per application, quiet hours 9PM-9AM)
- **CSC 23** — Admin Dashboard (`GET /webhook/csc-admin`) + daily 8PM digest
- **CSC 24** — Audit Logger (compliance trail, consent log)

---

## 📊 Data Tables (22)

| Table | Kaam |
|---|---|
| customers | Customer profiles (dedup by phone) |
| applications | Applications + CSC-2026-XXXXXX numbers |
| payments | Payment records (INITIATED → PAID) |
| conversation_state | Conversation state machine (NEW/FIELDS/DOCS/PAYMENT) |
| **service_catalog** | 14 services config (fees, portal, operator flags) |
| **service_fields** | 81 dynamic field definitions (Hinglish questions) |
| **service_documents** | 43 document requirements |
| **service_pricing** | Fee breakdown (gov + service + GST) |
| application_field_values | Collected form data |
| application_documents | Received docs + OCR text |
| application_status_history | Full audit of status changes |
| operator_tasks | Operator queue |
| handoff_queue | Human handoff tracking |
| notifications_log | Saare outbound messages |
| reminders_log | Anti-harassment counting |
| audit_log | Compliance trail |
| receipts | Payment receipts |
| system_config | Saari settings (WhatsApp creds, Razorpay, etc.) |
| payment_events | Raw gateway webhooks (signature_valid flag) |
| service_research | Unknown service AI research |
| consent_log | Customer consent records |
| message_log | Incoming message log |

---

## 🔒 Security Features (built-in)

1. **Payment verification** — sirf server-side HMAC-SHA256 signature verify karke hi payment PAID hota hai. Screenshot se kabhi confirm nahi.
2. **Duplicate payment protection** — already-PAID webhook events skip hote hain.
3. **Invalid signature → 401** + payment_events mein log.
4. **OTP/CAPTCHA** — operator khud daalta hai portal par; customer se kabhi OTP nahi maanga jaata.
5. **Aadhaar masking** — operator task messages mein `XXXX XXXX 1234` format.
6. **Consent + Audit** — har event audit_log mein; consent_log separate.
7. **Anti-harassment** — max 3 reminders per application, quiet hours respected.
8. **Never-invent AI** — confidence < 0.6 → UNKNOWN, sirf catalog ke 14 services offer hote hain.

---

## 🧪 Tested End-to-End (sandbox mein verify ho chuka hai)

```
"pan card banana hai" → ✅ AI: PAN_CARD, fee Rs 166
CONFIRM → ✅ 7 sawal (name/father/dob/mobile/email/address/aadhaar)
  - galat DOB → ⚠️ reject with hint ✅
3 documents bhejein → ✅ 0/3 → 1/3 → 2/3 → 3/3
  → ✅ Pricing: 107 + 50 + GST 9 = 166
  → ✅ Payment link (MOCK UPI)
Signed webhook → ✅ HMAC verified → PAID
  → ✅ Application Number: CSC-2026-5V4BL3
  → ✅ Receipt + Operator task created
Operator: QUEUE ✅ | DONE CSC-2026-5V4BL3 ✅ → SUBMITTED
Customer: STATUS → 🎉 SUBMITTED dikhata hai
HUMAN → bot pause + operator alert ✅ | RESUME ✅
Galat signature → 401 rejected ✅
Admin API /webhook/csc-admin → live stats JSON ✅
```

**Apna test customer:** 919876500001 (Harish Test) — 1 application demo data hai.
**Test admin number:** 919876500099 (CSC 17 commands ke liye).

---

## 🚀 Production Mein Jaane Ke Liye (5 steps)

### Step 1: WhatsApp Cloud API credentials
`system_config` table mein update karein (n8n UI → Data Tables → system_config):
| config_key | Value |
|---|---|
| WHATSAPP_PHONE_NUMBER_ID | Meta app ka phone number ID |
| WHATSAPP_ACCESS_TOKEN | Permanent system-user token |
| ADMIN_WHATSAPP_NUMBER | Apna asli operator number (91XXXXXXXXXX) |

Phir Meta App Dashboard → Webhooks → Callback URL: `https://APKA-DOMAIN/webhook/whatsapp` + verify token kuch bhi (CSC 01 challenge echo karta hai). Subscribe to **messages** field.

### Step 2: Razorpay (optional — abhi MOCK mode hai)
| config_key | Value |
|---|---|
| RAZORPAY_KEY_ID | rzp_test_xxx |
| RAZORPAY_KEY_SECRET | key secret |
| RAZORPAY_WEBHOOK_SECRET | webhook secret (already set: csc_webhook_secret_2026) |
| PAYMENT_MODE | RAZORPAY_TEST (ya MOCK rehne do) |

Razorpay Dashboard → Webhooks → `https://APKA-DOMAIN/webhook/payment-verify` → events: `payment.captured`, `order.paid`.

### Step 3: AI model choose karein
- **Abhi (sandbox-tested):** CSC 02 + CSC 25 OpenRouter free model use karte hain (`inclusionai/ling-3.0-flash-sante:free`).
- **India deployment:** Gemini credential already installed hai — CSC 02 mein chainLlm ka model swap karke Gemini use kar sakte hain (ya OpenRouter hi rakhein).

### Step 4: India se run karein
Sandbox HK IP se Gemini/Meta blocked hain. Apne PC/server (India) par:
```bash
# n8n export lein (ya poora database.sqlite copy karein)
n8n start   # same database rakhein
```

### Step 5: Workflows ACTIVE rakhein
CSC 01/13/23 ke production webhook URLs active hone chahiye. Activate order: sub-workflows pehle, CSC 01 last (script: `scripts/phase-build/activate-all.sh`).

---

## 🛠️ Maintenance

| Kaam | Kaise |
|---|---|
| Naya service add karna | service_catalog + service_fields + service_documents + service_pricing mein rows add karein — **koi workflow edit nahi chahiye!** |
| Operator commands dekhna | CSC 17 mein HELP likhein |
| Stats dekhna | `GET /webhook/csc-admin` ya roz 8PM digest |
| Test payment simulate | `bun scripts/phase-build/test-payment-webhook.js <application_id>` |
| State check | Data Tables UI se conversation_state/applications dekhein |
| Unknown services review | service_research table (AI ne analyze kiya hoga) |

## ⚠️ Known Limitations (v1)
- OCR token-gated hai (WhatsApp token set hone par hi chalega) — warna operator manually verify karta hai
- CHOICE fields ke options comma-separated hote hain (service_fields.options)
- MOCK payment mode mein webhook manually trigger karna padta hai (test script diya hai)
- Free OpenRouter model kabhi rate-limit ho sakta hai — CSC 02 mein model dropdown se change karein
