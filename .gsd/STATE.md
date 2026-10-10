# GSD State Snapshot

## Current Position
- **Project**: CSC Smart Seva (FormWala)
- **Status**: PAUSED for next session (Saved at 2026-10-09 22:50 IST)
- **Next Resume**: Start fresh, everything is tested, operational, and running.

## Last Session Summary
1. **n8n Permanently Removed**: Deleted `n8n` directory, removed webhook hops, WhatsApp Bridge runs in direct standalone mode (:8080 -> :8090) with message deduplication.
2. **16 CSC Services Conversational State Machine**: Implemented in `ai-agent/agent.mjs` with SQLite `conversation_state`. Supports question-by-question flow, mid-flow doubt resolution, document checklists, and application token creation (`FB-YYMMDD-NNNNN`).
3. **Full 16-Service Audit Passed**: Tested with `scripts/test-all-16-services.mjs` (16/16 Inquiry & Form Starts passed, mid-flow doubt handling verified).
4. **Razorpay Payment Gateway Live Integrated**: Configured API key `rzp_test_Tlssr6UdzI0dnp`, automatic dynamic payment link generation (`https://rzp.io/rzp/...`), and webhook listener `/payment-webhook` on :8090 with auto-notification to WhatsApp. Tested with `scripts/test-razorpay-flow.mjs`.

## Active Background Services
- **WhatsApp Bridge**: `:8080` (Connected as `917668483205`, standalone direct mode)
- **AI Agent**: `:8090` (Gemini 3.8 + SQLite State Machine + Razorpay Gateway + Webhook Listener)
- **Database**: SQLite `db/custom.db`

## Credentials in `.env`
- `RAZORPAY_KEY_ID`: `rzp_test_Tlssr6UdzI0dnp`
- `RAZORPAY_KEY_SECRET`: Configured in `.env`
- `GEMINI_API_KEY`: Configured in `.env`
- `BRIDGE_API_KEY`: `csc-bridge-2026`

## Next Steps (For Next Session)
1. Live testing on real WhatsApp phone numbers with Razorpay checkout test cards / UPI.
2. Next.js Operator Dashboard review (`npm run dev`) to inspect applications and payments live.
3. Switch Razorpay from test mode to live production key when the user is ready.
