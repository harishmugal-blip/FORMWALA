// Send a signed (HMAC-SHA256) Razorpay-style payment webhook to CSC 13
import crypto from "node:crypto";

const SECRET = "csc_webhook_secret_2026";
const APP_ID = process.argv[2] || "APPMULBNCMPWFYE";

const body = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_TEST" + Date.now().toString(36).toUpperCase(),
        amount: 16600,
        currency: "INR",
        status: "captured",
        notes: { application_id: APP_ID, phone: "919876500001" }
      }
    }
  }
});

const sig = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
const r = await fetch("http://localhost:3000/webhook/payment-verify", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-razorpay-signature": sig },
  body
});
console.log("HTTP", r.status, "| response:", (await r.text()).slice(0, 200));

// negative test: invalid signature
const r2 = await fetch("http://localhost:3000/webhook/payment-verify", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-razorpay-signature": "deadbeef" },
  body
});
console.log("INVALID SIG TEST ->", r2.status, (await r2.text()).slice(0, 100));
