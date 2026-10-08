// Field validators for the web chatbot — mirrors CSC 07 Input Validator logic.

export type Validation = { ok: true; value: string } | { ok: false; reason: string };

const digits = (s: string) => s.replace(/\D/g, "");

export function validateField(type: string, raw: string): Validation {
  const v = String(raw ?? "").trim();
  if (!v) return { ok: false, reason: "Khali jawab nahi chal sakta." };

  switch (type) {
    case "MOBILE": {
      let d = digits(v);
      if (d.length > 10 && d.startsWith("91")) d = d.slice(-10);
      if (d.length > 10 && d.startsWith("0")) d = d.slice(-10);
      if (d.length !== 10 || !/^[6-9]/.test(d))
        return { ok: false, reason: "10 digit ka sahi mobile number likhein (6/7/8/9 se shuru)." };
      return { ok: true, value: d };
    }
    case "AADHAAR": {
      const d = digits(v);
      if (d.length !== 12) return { ok: false, reason: "Aadhaar 12 digit ka hota he." };
      if (!/^[2-9]/.test(d)) return { ok: false, reason: "Aadhaar 2-9 se shuru hota he." };
      return { ok: true, value: d };
    }
    case "PAN": {
      const p = v.toUpperCase().replace(/\s/g, "");
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p))
        return { ok: false, reason: "PAN aisa hota he: ABCDE1234F (5 letter, 4 number, 1 letter)." };
      return { ok: true, value: p };
    }
    case "GSTIN": {
      const g = v.toUpperCase().replace(/\s/g, "");
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g) && g.length !== 15)
        return { ok: false, reason: "GSTIN 15 character ka hota he (22AAAAA0000A1Z5 jaisa)." };
      return { ok: true, value: g };
    }
    case "IFSC": {
      const f = v.toUpperCase().replace(/\s/g, "");
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f))
        return { ok: false, reason: "IFSC aisa he: SBIN0001234 (4 letter + 0 + 6 char)." };
      return { ok: true, value: f };
    }
    case "ACCOUNT": {
      const d = digits(v);
      if (d.length < 8 || d.length > 18)
        return { ok: false, reason: "Account number 8-18 digit ka hota he." };
      return { ok: true, value: d };
    }
    case "DOB": {
      const m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (!m) return { ok: false, reason: "Aise likhein: 15/08/1998" };
      const [, dd, mm, yy] = m;
      const d = +dd, mo = +mm, y = +yy;
      if (mo < 1 || mo > 12 || d < 1 || d > 31)
        return { ok: false, reason: "Date galat he — DD/MM/YYYY format me likhein." };
      const nowY = new Date().getFullYear();
      if (y < 1900 || y > nowY) return { ok: false, reason: `Saal ${1900}-${nowY} ke beech hona chahiye.` };
      return { ok: true, value: `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}` };
    }
    case "EMAIL": {
      const e = v.toLowerCase().replace(/\s/g, "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))
        return { ok: false, reason: "Email aisa likhein: naam@gmail.com" };
      return { ok: true, value: e };
    }
    case "NUMBER": {
      const d = digits(v);
      if (d.length < 1) return { ok: false, reason: "Sirf number likhein." };
      return { ok: true, value: d };
    }
    case "CHOICE": {
      return { ok: true, value: v }; // option matching happens in engine (fuzzy)
    }
    default: {
      if (v.length < 2) return { ok: false, reason: "Thoda detail me likhein." };
      // spec #10: jawab field ke type se match nahi karta to dobara poochna he —
      // pure date/number jaisa jawab TEXT field (naam/address) me galat he.
      // (letters hain to accept — "Gaya 823001" jaisa address valid he)
      const digitCount = (v.match(/[0-9]/g) || []).length;
      const letterCount = (v.match(/[a-zA-Z\u0900-\u097F]/g) || []).length;
      const looksLikeDate = /^\d{1,4}\s*[\/\-.]\s*\d{1,4}([\/\-.]\s*\d{2,4})?$/.test(v);
      if (looksLikeDate || (letterCount === 0 && digitCount >= 3))
        return {
          ok: false,
          reason: "Ye jawab is sawal ke liye sahi nahi lag raha — date/number ki jagah sahi jawab likhein.",
        };
      if (v.length > 300) return { ok: true, value: v.slice(0, 300) };
      return { ok: true, value: v };
    }
  }
}

export function matchChoice(options: string[], raw: string): Validation {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return { ok: false, reason: "Option me se chunein." };
  const exact = options.find((o) => o.toLowerCase() === v);
  if (exact) return { ok: true, value: exact };
  const partial = options.find(
    (o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase())
  );
  if (partial) return { ok: true, value: partial };
  const idx = parseInt(v, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= options.length) return { ok: true, value: options[idx - 1] };
  return { ok: false, reason: `Inme se chunein: ${options.join(" / ")}` };
}

// ---------- AI gate (ai-agent :8090) ----------

export type GateResult = { action: "reply" | "passthrough"; reply: string };

export async function aiFieldGate(params: {
  phone: string;
  name: string;
  text: string;
  state: string;
  serviceName: string;
  field?: { label: string; question: string };
  collected: Record<string, string>;
}): Promise<GateResult | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch("http://127.0.0.1:8090/field-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: params.phone,
        name: params.name,
        text: params.text,
        state: params.state,
        service_name: params.serviceName,
        field: params.field,
        docs: [],
        collected: params.collected,
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { action?: string; reply?: string };
    if (j && (j.action === "reply" || j.action === "passthrough"))
      return { action: j.action, reply: String(j.reply || "") };
    return null;
  } catch {
    return null; // ai-agent down → passthrough (flow continues)
  }
}

// AI reply sanitizer (spec #3/#16 defense-in-depth): AI kabhi fake completion
// claim nahi kar sakta ("submit ho gaya", "ban gayi", "payment link aayega")
// jabki application sirf verified engine flow se banti he. Match hone par
// honest replacement return hota he.
const FAKE_CLAIM_RE =
  /(submit\s*k[ai]r\s*(diya|diiya|dena|de\s*diya)|jama\s*k[ai]r\s*(diya|diiya)|application\s*(ban\s*gay|ho\s*gay|create\s*ho\s*gay)|aapka\s*(application|form)[^.]{0,50}(submit|ban\s*gay|ho\s*gay|ready\s*ho\s*gay)|form\s*(bhar\s*diya|submit\s*k[ai]r\s*(diya|diiya))|payment\s*link[^.]{0,60}(aayega|bhej\s*diya|bhej\s*raha|mil\s*gaya)|apply\s*(kar\s*diya|ho\s*gay))/i;

const HONEST_NO_ACTION =
  "Ek minute! 🙏 Ye kaam main yahin se confirm nahi kar sakta — application sirf official step-by-step process se hi banti he. Kaunsi service banwani he? Neeche card chunein ya service ka naam likhein.";

export function sanitizeAiReply(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  return FAKE_CLAIM_RE.test(String(text)) ? HONEST_NO_ACTION : String(text);
}

export async function aiGeneralChat(phone: string, text: string): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch("http://127.0.0.1:8090/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, text }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { reply?: string };
    return sanitizeAiReply(j?.reply ? String(j.reply) : null);
  } catch {
    return null;
  }
}

export const isSkip = (t: string) =>
  /^(skip|skipped|baad me|baadme|later|skip karo|skip kar|nahi dena|no)$/i.test(t.trim());
export const isCancel = (t: string) =>
  /^(cancel|cancelled|canceled|band karo|stop|chhodo|exit|ruko)$/i.test(t.trim());
export const isConfirm = (t: string) =>
  /^(confirm|confirmed|ha|haan|han|haan ji|yes|ok|okay|theek he|thik he|done|kar do|kardo|1)$/i.test(
    t.trim()
  );
export const isMenu = (t: string) =>
  /^(menu|services|seva|list|wapas|back|home|shuru|restart|nayi service)$/i.test(t.trim());
export const isPaid = (t: string) =>
  /(paid|pay kar diya|pay kardiya|payment ho gaya|ho gaya|kar diya|bhej diya|complete|done|ho gaya he)/i.test(
    t.trim()
  );
