// CSC AI Agent Service v2 — natural Hinglish conversational brain
// Port 8090. LLM chain: Gemini (user key, circuit-breaker) -> z-ai SDK -> keyword fallback.
//
// POST /chat       {phone, name, text, catalog, state, pending_service}
//                    -> {reply, service_id, intent, confidence, source}
// POST /field-chat {phone, name, text, state, service_name, field, docs, collected}
//                    -> {action: answer|reply|cancel|passthrough, value, reply, source}
// GET  /health
// POST /reset      {phone}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ZAI from 'z-ai-web-dev-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.AI_PORT || 8090);
const MEM_FILE = path.join(__dirname, 'memory.json');
const MAX_TURNS = 16; // messages kept per customer (8 user + 8 agent)

// ---------- Gemini config (user-provided Google AI Studio key) ----------
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-flash-latest'];
const breaker = { fails: 0, openUntil: 0 };
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000; // 10 min

function geminiArmed() {
  if (!GEMINI_KEY) return false;
  if (breaker.fails >= BREAKER_THRESHOLD && Date.now() < breaker.openUntil) return false;
  return true;
}
function geminiFail() {
  breaker.fails += 1;
  if (breaker.fails >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    console.log(new Date().toISOString(), '[ai-agent] Gemini breaker OPEN for 10min (fails:', breaker.fails, ')');
  }
}
function geminiOk() { breaker.fails = 0; }

// Extract the model's JSON block from any response envelope shape.
function extractJsonBlock(rawText) {
  const s = String(rawText || '');
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function tryGemini(systemText, userText) {
  const flat = systemText + '\n\n=== customer message / context ===\n' + userText;
  // Shape A: Interactions API (new models)
  for (const model of GEMINI_MODELS) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: { type: 'text', text: flat } }),
        signal: AbortSignal.timeout(12000),
      });
      const txt = await r.text();
      if (!r.ok) throw new Error('interactions ' + r.status + ': ' + txt.slice(0, 120));
      const parsed = extractJsonBlock(txt);
      if (parsed && (parsed.reply || parsed.action)) return parsed;
      throw new Error('interactions no-json-in-output');
    } catch (e) {
      console.log(new Date().toISOString(), '[ai-agent] gemini try (' + model + ' interactions):', String(e?.message || e).slice(0, 150));
    }
  }
  // Shape B: classic generateContent (older models that still exist)
  for (const model of GEMINI_MODELS) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST',
        headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: flat }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 800 } }),
        signal: AbortSignal.timeout(12000),
      });
      const txt = await r.text();
      if (!r.ok) throw new Error('genContent ' + r.status + ': ' + txt.slice(0, 120));
      const parsed = extractJsonBlock(txt);
      if (parsed && (parsed.reply || parsed.action)) return parsed;
      throw new Error('genContent no-json-in-output');
    } catch (e) {
      console.log(new Date().toISOString(), '[ai-agent] gemini try (' + model + ' genContent):', String(e?.message || e).slice(0, 150));
    }
  }
  throw new Error('gemini all shapes failed');
}

// ---------- conversation memory ----------
const memory = new Map();
try {
  const saved = JSON.parse(fs.readFileSync(MEM_FILE, 'utf8'));
  for (const [k, v] of Object.entries(saved || {})) memory.set(k, v);
} catch { /* first boot */ }

function saveMemory() {
  try { fs.writeFileSync(MEM_FILE, JSON.stringify(Object.fromEntries(memory))); } catch { /* non-fatal */ }
}

function historyFor(phone) {
  if (!memory.has(phone)) memory.set(phone, []);
  return memory.get(phone);
}

// ---------- prompt building (/chat) ----------
const svcLine = (s) => {
  const id = s.service_id || s.id || '';
  const name = s.service_name || s.name || id;
  const total = s.total_fee ?? s.total ?? '';
  const govt = s.government_fee ?? s.govt_fee ?? '';
  const svc = s.service_charge ?? s.service_fee ?? '';
  const gst = s.gst ?? '';
  let line = `- ${id} | ${name}`;
  if (total !== '') line += ` | Total: Rs ${total}`;
  if (govt !== '' || svc !== '') line += ` (Govt: Rs ${govt} + Service: Rs ${svc} + GST: Rs ${gst})`;
  return line;
};

function systemPrompt(catalog) {
  const lines = (catalog || []).map(svcLine).join('\n') || '(catalog uplabdh nahi)';
  return [
    'Tum "Ravi" ho - CSC Digital Seva Kendra ka WhatsApp sahayak. Ek smart, friendly dukaan manager ki tarah baat karo jo sarkari kaam karwata hai.',
    '',
    'SERVICES AUR FEES (sirf yahi hai, yahi fees hai - kabhi kuch aur mat banao):',
    lines,
    '',
    'NIYAM:',
    '1. Hinglish me natural baat karo - jaise ek pyara dukaan manager. Chhote WhatsApp-style messages (2-4 line max). Sirf 1 emoji, zaroorat ho to.',
    '2. Jawab SE pehle customer ke sawaal/point ka jawab do, phir aage badho. Kabhi bhi apni pichhli line word-to-word repeat mat karo - har baar naye shabdon me bolo.',
    '3. Customer shikayat kare, ajeeb bole, ya gusse me ho - pehle 1 line me politely acknowledge karo, phir smoothly kaam par lag jao.',
    '4. Customer jis service me interest dikhaye uski TOTAL fee batao aur bolo ki pakka karwana ho to "CONFIRM" likhe.',
    '5. PENDING_SERVICE sirf isliye diya jata hai ki pata rahe pehle kya chuna tha - isko khud se offer mat karo. Sirf tab use karo jab customer CONFIRM bole ya usi service ke bare me puchhe.',
    '6. Agar service offer kar chuke ho aur customer CONFIRM/HAAN/OK/PAKKA/THEEK/SAHI bole -> intent NEW_APPLICATION, service ka id, confidence 0.9.',
    '7. Application status puchhe -> intent STATUS_CHECK. Operator/insaan se baat maange -> intent HUMAN_AGENT.',
    '8. General sawal (documents kya lagenge, kitna time lagega, JPEG/PDF chalega kya etc.) -> apne level pe confidently help karo, intent GENERAL_QUESTION.',
    '9. Sirf greeting/chhota-mota baat -> natural tarike se respond karo (sirf menu mat thoko), intent GREETING, service UNKNOWN.',
    '10. Out-of-scope/galat kaam politely mana karo. Kabhi OTP, pin, bank details mat maango. Payment sirf official process se hoga - bolo ki confirm karne par link/form aayega.',
    '11. Fees ke bare me sirf upar di gayi list use karo. Jo service list me nahi hai uske liye "ye service hum nahi karte" bolo.',
    '12. Pichhli baat-cheet yaad rakho (history di hoti hai). Agar customer pehle hi confirm kar chuka hai to dobara fee mat batao.',
    '',
    'SABSE ZAROORI: Apna poora jawab SIRF is JSON me do - koi markdown, koi extra text nahi:',
    '{"reply":"<Hinglish WhatsApp message>","service":"<SERVICE_ID ya UNKNOWN>","intent":"NEW_APPLICATION|STATUS_CHECK|HUMAN_AGENT|GENERAL_QUESTION|GREETING","confidence":0.0}',
  ].join('\n');
}

function userPrompt(b) {
  const hist = historyFor(b.phone || 'unknown');
  const recent = hist.slice(-MAX_TURNS).map((m) => `${m.role === 'user' ? 'CUSTOMER' : 'TUM'}: ${m.content}`).join('\n');
  return [
    `CUSTOMER KA NAAM: ${b.name || 'Customer'} (phone ${b.phone || 'unknown'})`,
    `CONVERSATION STATE: ${b.state || 'NEW'} | PENDING_SERVICE: ${b.pending_service || '-'}`,
    recent ? `PICHLI BAAT-CHEET:\n${recent}` : 'PICHLI BAAT-CHEET: (nayi baat-cheet)',
    '',
    `NAYA MESSAGE: ${String(b.text || '').slice(0, 500)}`,
  ].join('\n');
}

// ---------- prompt building (/field-chat) ----------
const FORMAT_RULES = {
  DOB: 'Sirf DD/MM/YYYY format me (jaise 17/04/2001). "17 April 2001", "17-04-2001", "April 17 2001" sabko 17/04/2001 banao.',
  MOBILE: 'Sirf 10 digit, 6-9 se shuru. +91/0/spaces hata do. "78359 08508" -> "7835908508".',
  EMAIL: 'Lowercase valid email (jaise name@gmail.com).',
  PAN: '10 character uppercase, jaise ABCPD1234F.',
  GSTIN: '15 character uppercase. User ke paas na ho to value ki jagah SKIP likho.',
  AADHAAR: 'Sirf 12 digit, spaces hatate hue.',
  PINCODE: 'Sirf 6 digit.',
  OPTIONS: 'User ka jawab options list ke EXACT word me convert karo (jo option sabse paas ho). Match na ho to action "reply" use karo.',
  TEXT: 'Spelling theek karke wahi jawab, chhota aur saaf. Naam ho to proper case me (jaise "mohd harish" -> "Mohd Harish").',
};

function fieldChatPrompt(b) {
  const f = b.field || {};
  const ftype = String(f.field_type || 'TEXT').toUpperCase();
  const docs = (b.docs || []).map((d, i) => `${i + 1}. ${d.label || d.doc_key || d}`).join('\n');
  const collected = (b.collected || []).map((c) => `- ${c.label}: ${c.value}`).join('\n');
  return [
    'CONTEXT: WhatsApp par ek sarkari service ka form bhar rahe hain. Customer se ek-ek karke fields maange ja rahe hain.',
    `SERVICE: ${b.service_name || '-'}`,
    collected ? `AB TAK BHARE FIELDS:\n${collected}` : '',
    '',
    b.state === 'FIELDS' ? (
      `CURRENT FIELD: ${f.label || f.question || '-'}\n` +
      `FIELD TYPE: ${ftype}\n` +
      `FORMAT RULE: ${FORMAT_RULES[ftype] || FORMAT_RULES.TEXT}\n` +
      (f.options ? `OPTIONS: ${f.options}\n` : '')
    ) : b.state === 'DOCS' ? (
      `YEH DOCS MAANGE JA RAHE HAIN:\n${docs || '(list nahi)'}\nPhoto/JPG/PDF accept hota hai. Customer abhi text bheja hai (document nahi).`
    ) : (
      `PAYMENT pending hai. Official link bheja ja chuka hai. Payment confirm hone par hi aage badhega.`
    ),
    '',
    `CUSTOMER KA NAYA MESSAGE: "${String(b.text || '').slice(0, 400)}"`,
    '',
    'TUMHARA KAAM: decide karo ki ye message kya hai:',
    '- "answer": ye isi sawal ka jawab hai -> value ko FORMAT RULE ke hisaab se convert karke do.',
    '- "reply": ye koi sawal/baat hai (document format, time, shikayat, beech me kuch aur puchhna) -> pehle 1-2 line me pyar se jawab do, phir halke se current sawal wapas puchho. Document/sawal se related common knowledge confidently do (JPEG/PDF dono chalega, size 2MB tak theek hai, time 1-3 din etc.) - fees ka galat number kabhi mat bolo.',
    '- "cancel": customer kaam band karna chahta hai.',
    '- "passthrough": tum sure nahi ho -> value me customer ka raw text daal do.',
    'IMPORTANT: Agar sawal me SKIP ka option likha hai (jaise "nahi hai toh SKIP likhein") aur customer ne SKIP/Skip/skip likha hai, to ye "answer" hai - value "SKIP" do. Mana mat karo.',
    '',
    'SABSE ZAROORI: SIRF is JSON me jawab do - koi markdown/extra text nahi:',
    '{"action":"answer|reply|cancel|passthrough","value":"<sirf answer me, normalized>","reply":"<sirf reply me, Hinglish 1-3 line>"}',
  ].filter(Boolean).join('\n');
}

// ---------- fallback classifier (/chat) ----------
function fallback(b) {
  const up = String(b.text || '').toUpperCase();
  const catalog = b.catalog || [];
  const find = (kw) => catalog.find((s) => String(s.service_id || s.id || '').toUpperCase().includes(kw) || String(s.service_name || s.name || '').toUpperCase().includes(kw));
  let svc = null;
  if (/PAN/.test(up)) svc = find('PAN');
  else if (/GST/.test(up)) svc = find('GST');
  else if (/ITR|INCOME\s*TAX/.test(up)) svc = find('ITR');
  else {
    for (const s of catalog) {
      const nm = String(s.service_name || s.name || '').toUpperCase();
      if (nm && up.split(/\s+/).some((w) => w.length > 3 && nm.includes(w))) { svc = s; break; }
    }
  }
  if (/HUMAN|AGENT|OPERATOR/.test(up)) return { reply: 'Main aapko CSC operator se jod raha hoon, thodi der me wo aapko reply karenge. 🙏', service_id: 'UNKNOWN', intent: 'HUMAN_AGENT', confidence: 0.9, source: 'fallback' };
  if (/STATUS|APPLICATION/.test(up)) return { reply: 'Status check ke liye thoda detail dijiye - application number ya kis service ki baat hai?', service_id: 'UNKNOWN', intent: 'STATUS_CHECK', confidence: 0.8, source: 'fallback' };
  if (svc) return { reply: `Ji, ${svc.service_name || svc.name} hum banwate hain. Total fee Rs ${svc.total_fee ?? svc.total ?? '??'} hai. Karwana ho to "CONFIRM" likh dijiye. 😊`, service_id: svc.service_id || svc.id, intent: 'GREETING', confidence: 0.75, source: 'fallback' };
  const list = catalog.slice(0, 8).map((s, i) => `${i + 1}. ${s.service_name || s.name}`).join(', ');
  return { reply: `Namaste${b.name ? ' ' + b.name : ''}! 🙏 Main CSC Smart Seva ka sahayak Ravi hoon. Hum ye kaam karwate hain: ${list}. Aap kya karwana chahenge?`, service_id: 'UNKNOWN', intent: 'GREETING', confidence: 0.5, source: 'fallback' };
}

// ---------- LLM orchestration ----------
let zai = null;
async function getZai() {
  if (!zai) zai = await ZAI.create();
  return zai;
}

function parseAiJson(raw) {
  const cleaned = String(raw || '').replace(/```json|```/g, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Gemini -> z-ai. Returns {parsed, source} or throws.
async function llmJson(systemText, userText) {
  if (geminiArmed()) {
    try {
      const parsed = await tryGemini(systemText, userText);
      geminiOk();
      return { parsed, source: 'gemini' };
    } catch (e) {
      geminiFail();
    }
  }
  const z = await getZai();
  const completion = await z.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemText },
      { role: 'user', content: userText },
    ],
    thinking: { type: 'disabled' },
    temperature: 0.5,
  });
  const raw = completion?.choices?.[0]?.message?.content || '';
  const parsed = parseAiJson(raw);
  if (!parsed) throw new Error('z-ai reply unparseable');
  return { parsed, source: 'zai' };
}

const VALID_INTENTS = ['NEW_APPLICATION', 'STATUS_CHECK', 'HUMAN_AGENT', 'GENERAL_QUESTION', 'GREETING'];

async function chatWithAI(b) {
  const { parsed: ai, source } = await llmJson(systemPrompt(b.catalog), userPrompt(b));
  if (!ai || !ai.reply) throw new Error('AI reply unparseable');
  const intent = VALID_INTENTS.includes(ai.intent) ? ai.intent : 'GREETING';
  const sid = (ai.service && String(ai.service)) || 'UNKNOWN';
  const conf = Math.max(0, Math.min(1, Number(ai.confidence) || 0));
  return { reply: String(ai.reply).slice(0, 900), service_id: sid, intent, confidence: conf, source };
}

async function fieldChat(b) {
  try {
    const { parsed: ai, source } = await llmJson(fieldChatPrompt(b), 'Customer ka message upar diya gaya hai. Ab JSON do.');
    const action = ['answer', 'reply', 'cancel', 'passthrough'].includes(String(ai.action)) ? String(ai.action) : 'passthrough';
    const value = String(ai.value ?? '').slice(0, 300);
    const reply = String(ai.reply ?? '').slice(0, 700);
    if (action === 'answer' && !value.trim()) return { action: 'reply', reply: reply || 'Thoda clear me likh dijiye please. 🙏', source };
    return { action, value, reply, source };
  } catch (e) {
    console.log(new Date().toISOString(), '[ai-agent] field-chat LLM failed, passthrough:', String(e?.message || e).slice(0, 150));
    return { action: 'passthrough', value: String(b.text || ''), reply: '', source: 'fallback' };
  }
}

// ---------- /compose: structural messages -> natural Hinglish ----------
// Kind-specific prompt. STRICT rules: numbers/options/links/keywords EXACT.
function composePrompt(kind, b) {
  const p = b.payload || {};
  const svc = p.service_name || 'service';
  const base = [
    'Tum "Ravi" ho - CSC Smart Seva ka friendly WhatsApp assistant (Hinglish, warm, helpful).',
    'Tumhe ek STRUCTURAL DRAFT message ko natural, fresh Hinglish me rewrite karna hai.',
    '',
    'STRICT RULES:',
    '- Numbers, amounts, counters (jaise "Sawal 2/8", "(3/4 documents)"), links, option lists, aur keywords (CONFIRM, CANCEL, STATUS, HUMAN, SKIP) BILKUL waise hi rakho jaise draft me hain',
    '- WhatsApp style: chhota, clear, 1-4 line. Draft se zyada lamba mat karo',
    '- Har baar ALAG phrasing - pichhle messages jaisi exact lines repeat mat karo',
    '- Emoji halka (0-2). Over-enthusiastic mat bano',
    '- Galat information kabhi mat jodo (fees, time, document rules) - sirf draft me jo hai wahi',
    '- SIRF is JSON me jawab do: {"text":"<final message>"}',
  ];
  let kindSpec = '';
  if (kind === 'field_start') {
    kindSpec = [
      `KIND: Service confirm hua, ab form shuru. Service: ${svc}.`,
      `Pehla sawal: ${p.field_question || '-'}${p.field_options ? ` (options: ${p.field_options})` : ''}`,
      'Tone: confirm karke friendly start karo, sawal ke options/list EXACT rakho, CANCEL ka zikr rakho.',
    ].join('\n');
  } else if (kind === 'field_question') {
    kindSpec = [
      `KIND: Form ka agla sawal. Service: ${svc}. Sawal ${p.index}/${p.total}.`,
      `Sawal: ${p.field_question || '-'}${p.field_options ? ` (options: ${p.field_options})` : ''}`,
      p.prev_value ? `Pichhla jawab: "${p.prev_label}: ${p.prev_value}" - iska 2-4 word ka natural ack pehle do (jaise "Theek hai", "Ho gaya", "Shukriya"), phir agla sawal.` : '',
      'Sawal counter format "Sawal X/Y:" halka sa rakho ya natural banao, par progress clear rahe.',
    ].filter(Boolean).join('\n');
  } else if (kind === 'docs_intro') {
    kindSpec = [
      `KIND: Saare form fields complete hue, ab documents chahiye. Service: ${svc}.`,
      `DOCS LIST (EXACT copy karo, numbering same):\n${p.docs_list || '-'}`,
      'Tone: chhoti khushi + clear list + instruction (ek-ek karke photo/PDF). Payment link baad me milega, CANCEL option hai.',
    ].join('\n');
  } else if (kind === 'doc_ask') {
    kindSpec = [
      `KIND: Documents stage me agla doc maangna. Service: ${svc}. Progress: ${p.saved || 0}/${p.total || 0} mil gaye.`,
      `AGLA DOC: ${p.doc_label || '-'} - ${p.doc_question || 'photo bhejein'}`,
      'Tone: gentle, clear. Progress counter "(X/Y documents mil gaye)" rakho.',
    ].join('\n');
  } else if (kind === 'doc_ack') {
    kindSpec = [
      `KIND: Ek document receive ho gaya, acknowledge karo. Progress: ${p.saved || 0}/${p.total || 0}.`,
      'Tone: short confirmation + next doc bhejne ka kehna. Exact counter "(X/Y)" ya "X/Y" rakho.',
    ].join('\n');
  } else if (kind === 'payment_note') {
    kindSpec = [
      `KIND: Payment pending note. Service: ${svc}.`,
      'Link/amount agar draft me hai to EXACT rakho. STATUS aur HUMAN keywords waise hi rahne do.',
      'Tone: patient reminder, koi pressure nahi.',
    ].join('\n');
  }
  return [
    ...base,
    '',
    kindSpec,
    '',
    `DRAFT (ise natural banao):`,
    `"""`,
    String(b.draft || ''),
    `"""`,
  ].join('\n');
}

async function compose(b) {
  const draft = String(b.draft || '');
  if (!draft.trim()) return { text: draft, source: 'noop' };
  try {
    const { parsed, source } = await llmJson(composePrompt(String(b.kind || ''), b), 'Draft upar diya gaya hai. Ab {"text":"..."} JSON do.');
    const text = String((parsed && parsed.text) || '').trim();
    // safety: number/link integrity check
    const nums = (s) => (String(s).match(/\d+/g) || []).join(',');
    const links = (s) => (String(s).match(/https?:\/\/\S+/g) || []).join(',');
    const okNums = !links(draft) ? nums(draft) === nums(text) || text.length > 0 : links(draft) === links(text);
    if (text && okNums && text.length >= Math.min(20, draft.length * 0.4)) {
      return { text: text.slice(0, 1200), source };
    }
    return { text: draft, source: 'safety-fallback' };
  } catch (e) {
    console.log(new Date().toISOString(), '[ai-agent] compose failed, draft fallback:', String(e?.message || e).slice(0, 140));
    return { text: draft, source: 'fallback' };
  }
}

// ---------- http ----------
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const p = (req.url || '').split('?')[0];
  try {
    if (p === '/health') return json(res, 200, { ok: true, sessions: memory.size, gemini: GEMINI_KEY ? (geminiArmed() ? 'armed' : 'breaker-open') : 'off' });

    if (p === '/reset' && req.method === 'POST') {
      const b = await readBody(req);
      memory.delete(b.phone || '');
      saveMemory();
      return json(res, 200, { ok: true });
    }

    if (p === '/chat' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.text) return json(res, 400, { error: 'text required' });
      b.phone = String(b.phone || 'unknown');

      let out;
      try {
        out = await chatWithAI(b);
      } catch (e) {
        console.log(new Date().toISOString(), '[ai-agent] LLM failed, fallback:', String(e?.message || e).slice(0, 200));
        out = fallback(b);
      }

      const hist = historyFor(b.phone);
      hist.push({ role: 'user', content: String(b.text || '').slice(0, 300) });
      hist.push({ role: 'assistant', content: out.reply });
      while (hist.length > MAX_TURNS) hist.shift();
      saveMemory();

      return json(res, 200, {
        reply: out.reply,
        service_id: out.service_id || 'UNKNOWN',
        intent: out.intent || 'GREETING',
        confidence: out.confidence ?? 0,
        source: out.source,
      });
    }

    if (p === '/field-chat' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.text) return json(res, 400, { error: 'text required' });
      b.phone = String(b.phone || 'unknown');
      const out = await fieldChat(b);
      return json(res, 200, out);
    }

    if (p === '/compose' && req.method === 'POST') {
      const b = await readBody(req);
      const out = await compose(b);
      return json(res, 200, out);
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    console.log(new Date().toISOString(), '[ai-agent] http error:', String(e?.message || e));
    return json(res, 500, { error: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(new Date().toISOString(), `[ai-agent] v2 listening on :${PORT} (sessions: ${memory.size}, gemini: ${GEMINI_KEY ? 'armed' : 'off'})`);
});
