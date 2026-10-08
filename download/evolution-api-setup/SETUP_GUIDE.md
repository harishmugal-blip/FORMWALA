# CSC Smart Seva - Evolution API (Free WhatsApp) Setup Guide
# Hinglish guide - VPS pe 10 minute mein live

## Ye kya hai?
Evolution API 100% free open-source WhatsApp server hai. QR scan karke
koi bhi WhatsApp number connect hota hai, aur hamara n8n system us
number se message receive + reply kar sakta hai. Meta se koi approval
nahi chahiye. **Customer pehle message bhejta hai, hum sirf reply karte
hain - ye safest pattern hai (ban risk ~zero).**

---

## STEP 1: VPS lo (₹300-500/month)
- Koi bhi: DigitalOcean / Hetzner / Contabo / Indian host (E2E Networks, Hostinger)
- Specs: Ubuntu 22.04+, 2GB RAM, 1 CPU kaafi hai
- **Tip:** n8n bhi isi server pe chalega (production deployment)

## STEP 2: Docker install (2 min)
```bash
curl -fsSL https://get.docker.com | bash
```

## STEP 3: Files upload + start (3 min)
```bash
mkdir -p /opt/evolution && cd /opt/evolution
# docker-compose.yml yahan upload karo (ye file)
nano .env   # ya skip karo - default passwords change karne honge

# .env example:
#   DB_PASSWORD=ApnaStrongPassword123
#   EVO_API_KEY=csc-evo-KEY-2026-ApnaSecret
#   SERVER_URL=http://VPS_KA_IP:8080

docker compose up -d
docker compose logs -f   # "Server is running" dikhne tak wait
```

## STEP 4: WhatsApp instance banao + QR scan (2 min)
```bash
# Instance create karo (QR code milega response mein)
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: ApnaEvoApiKey" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "csc-bot", "qrcode": true, "integration": "WHATSAPP-BAILEYS"}'
```
Response mein `base64` QR code hoga:
- QR ko [https://qrcode.show] type site pe paste karke dekho, YA
- Browser mein kholo: `http://VPS_IP:8080/instance/connect/csc-bot?apikey=KEY`

**Phone se scan karo:** WhatsApp → Settings → Linked Devices → Link a Device
- ⚠️ Fresh SIM/number use karo (personal number nahi)

## STEP 5: Webhook connect karo → n8n (2 min)
```bash
curl -X POST http://localhost:8080/webhook/set/csc-bot \
  -H "apikey: ApnaEvoApiKey" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://N8N_KA_PUBLIC_URL/webhook/whatsapp",
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```
- `N8N_KA_PUBLIC_URL` = jahan n8n chal raha hai (domain + SSL recommended)

## STEP 6: n8n mein config daalo (1 min)
n8n Data Tables → `system_config` table mein ye 3 rows update karo:

| config_key | config_value |
|---|---|
| EVO_URL | http://VPS_KA_IP:8080 |
| EVO_API_KEY | ApnaEvoApiKey |
| EVO_INSTANCE | csc-bot |

**Bas! Ab customer WhatsApp karega, bot reply karega.** 🎉

---

## Test kaise kare?
1. Apne phone se CSC ke number pe WhatsApp karo: "pan card banana hai"
2. Bot turant reply karega (fee ke saath)
3. Evolution logs: `docker compose logs -f evolution-api`

## Sending ka logic (already built in n8n):
```
EVO_URL + EVO_API_KEY + EVO_INSTANCE set hain?
  → YES: Evolution se send (FREE)
  → NO: Meta Cloud API se send (agar WHATSAPP_ACCESS_TOKEN set hai)
  → NO: MOCK mode (test/demo)
```

## Common problems:
| Problem | Solution |
|---|---|
| QR scan ke baad disconnect | Server pe timezone set karo: `timedatectl set-timezone Asia/Kolkata` |
| "Connection Closed" baar-baar | Number pe WhatsApp app se ek baar manually chat kholo |
| Webhook nahi aa raha | n8n URL public + SSL hona chahiye, firewall port check karo |
| Number ban ho gaya | Fresh number lo, bulk sending mat karo (hamara pattern safe hai) |

## Security tips:
- VPS firewall: sirf 8080 (Evolution) + n8n port + SSH kholo
- Strong EVO_API_KEY rakho
- Nginx + SSL (Let's Encrypt) laga ke Evolution ko domain pe daalo
