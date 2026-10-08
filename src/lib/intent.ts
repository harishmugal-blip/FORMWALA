// FormBot — structured intent detection (spec #5).
// Layer 1: local regex/keyword fast-paths (instant, deterministic)
// Layer 2: ai-agent /intent classifier (LLM, injection-hardened) with keyword fallback
// Output is backend-safe structured data — engine decides what to execute.

import { getServices, type Svc } from "@/lib/csc-catalog";

export const INTENTS = [
  "SERVICE_DISCOVERY",
  "START_APPLICATION",
  "CONTINUE_APPLICATION",
  "DOCUMENT_UPLOAD",
  "DOCUMENT_QUERY",
  "INFORMATION_UPDATE",
  "APPLICATION_SUMMARY",
  "CONFIRM_APPLICATION",
  "PAYMENT_QUERY",
  "PAYMENT_START",
  "PAYMENT_STATUS",
  "APPLICATION_STATUS",
  "TOKEN_LOOKUP",
  "RESULT_REQUEST",
  "HUMAN_HELP",
  "OPERATOR_REQUEST",
  "CANCEL_APPLICATION",
  "FAQ",
  "GREETING",
  "UNKNOWN",
] as const;

export type Intent = (typeof INTENTS)[number];

export type IntentResult = {
  intent: Intent;
  serviceCandidate: string; // service_id ya ""
  confidence: number;
  source: "regex" | "ai" | "keyword";
};

const TOKEN_RE = /\bFB-\d{6}-\d{4,6}\b/i;
export const extractToken = (text: string): string | null => {
  const m = String(text || "").match(TOKEN_RE);
  return m ? m[0].toUpperCase() : null;
};

export const CSC_NUMBER_RE = /\b(?:CSC|APP)-\d{4}-[A-Z0-9]{4,8}\b/i;

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "");
}

// word tokens (spaces/rasi preserve) — "mujhe mool niwas banana hai" -> [mujhe,mool,niwas,banana,hai]
function tokenize(s: string) {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097F]+/)
    .filter((w) => w.length > 0);
}

// fuzzy service matcher — typos + partials (spec #4: "mool niwas bnwana h")
export function matchService(text: string, services: Svc[]): { svc: Svc; score: number } | null {
  const t = normalize(text);
  if (!t || t.length < 3) return null;
  const tTokens = tokenize(text);
  let best: { svc: Svc; score: number } | null = null;

  for (const s of services) {
    const candidates = [s.service_name, s.service_id, s.category];
    for (let ci = 0; ci < candidates.length; ci++) {
      const c = candidates[ci];
      const n = normalize(c);
      if (!n || n.length < 3) continue;
      // category matches cap kiya — real naam hamesha jeete
      const cap = ci === 2 ? 0.62 : 1;
      let score = 0;
      if (n === t) score = 0.98;
      else if (t.includes(n) && n.length >= 4) score = 0.9;
      else if (n.includes(t) && t.length >= 4) score = 0.85;
      else {
        // word overlap (normalized whole-string level)
        const tWords = t.split(/(?=[A-Z])/).concat(t.split(" ")).filter((w) => w.length >= 4);
        const nWords = n.split(" ").filter((w) => w.length >= 3);
        const overlap = nWords.filter((w) => tWords.some((tw) => tw.includes(w) || w.includes(tw))).length;
        if (overlap && nWords.length) score = Math.min(0.8, 0.5 + overlap / nWords.length * 0.3);
      }
      // TOKEN-level match (asli fix): "Mool Niwas / Domicile" me se
      // "mool"+"niwas" dono text me hain → coverage 2/3 → ~0.82
      const cTokens = tokenize(c);
      if (cTokens.length && tTokens.length) {
        const matched = cTokens.filter((ct) => {
          if (ct.length < 3) return tTokens.some((tt) => tt === ct);
          return tTokens.some(
            (tt) =>
              tt === ct ||
              (tt.length >= 4 && ct.length >= 4 && (tt.startsWith(ct) || ct.startsWith(tt)))
          );
        }).length;
        const coverage = matched / cTokens.length;
        if (coverage > 0) score = Math.max(score, 0.55 + 0.4 * coverage);
      }
      score = Math.min(score, cap);
      if (score && (!best || score > best.score)) best = { svc: s, score };
    }
  }
  return best && best.score >= 0.5 ? best : null;
}

// ---------- Layer 1: regex fast paths ----------
export function fastIntent(text: string, sessionStage: string): IntentResult | null {
  const t = String(text || "").trim();
  const low = t.toLowerCase();

  if (TOKEN_RE.test(t)) return { intent: "TOKEN_LOOKUP", serviceCandidate: "", confidence: 0.99, source: "regex" };

  if (/^(hi+|hello+|namaste|namaskar|hey|salam|salaam|assalam[.\w ]*|good (morning|afternoon|evening))[!. ]*$/i.test(low))
    return { intent: "GREETING", serviceCandidate: "", confidence: 0.95, source: "regex" };

  if (/^(cancel|cancelled|canceled|band karo|band kro|chhodo|exit|ruko|stop)\b/i.test(low))
    return { intent: "CANCEL_APPLICATION", serviceCandidate: "", confidence: 0.9, source: "regex" };

  if (/(operator|insaan|inhuman|agent|real person|call karo|phone karo|baat karni he|baat karni hai|human (help|support))/i.test(low))
    return { intent: "OPERATOR_REQUEST", serviceCandidate: "", confidence: 0.88, source: "regex" };

  if (/(kaha tak|kahan tak|pahucha|pahuncha|status (kya|bata|check|dikhao)|application (status|update|kaha)|mera (application|form) kaha)/i.test(low))
    return { intent: "APPLICATION_STATUS", serviceCandidate: "", confidence: 0.8, source: "regex" };

  // Customer 360° brief — "meri jankari", "kya kya banwaya", history/record maangna
  if (
    /(meri|apni|sabhi|sari|sab|puri|poora|pura|mahari)[a-z ]{0,8}(jankari|jaankari|detail|details|history|record|information)|kya kya banwaya|kya kya banwaye|kya banwaya (he|hai)|mera (sara|saara|poora|pura) (kaam|record|data|status)|(meri|apni) (sabhi|sari|sab) (application|seva)/i.test(
      low
    )
  )
    return { intent: "APPLICATION_STATUS", serviceCandidate: "", confidence: 0.86, source: "regex" };

  if (/^(menu|services|seva|sevaayein|list|wapas|back|home|restart|nayi service|nayi seva)\b/i.test(low))
    return { intent: "SERVICE_DISCOVERY", serviceCandidate: "", confidence: 0.85, source: "regex" };

  if (/(kaun (se )?document|kya document|documents? (chahiye|kya lagenge|kya lage)|kagaz kya|required documents)/i.test(low))
    return { intent: "DOCUMENT_QUERY", serviceCandidate: "", confidence: 0.78, source: "regex" };

  if (/^(confirm|confirmed|ha|haan|han|haan ji|yes|ok|okay|theek he|thik he|pakka|kar do|kardo|1)[.! ]*$/i.test(low) && sessionStage === "SUMMARY")
    return { intent: "CONFIRM_APPLICATION", serviceCandidate: "", confidence: 0.9, source: "regex" };

  if (/(payment|pay)\s*(ni|nahi|nhi)?\s*(hua|ho gaya|done|hoga|kaise|kese|kitna|karna he)|payment (status|help|doubt|problem)/i.test(low))
    return { intent: "PAYMENT_QUERY", serviceCandidate: "", confidence: 0.72, source: "regex" };

  return null;
}

// ---------- Layer 2: AI classifier ----------
export async function classifyIntent(
  text: string,
  stage: string,
  services?: Svc[]
): Promise<IntentResult> {
  const fast = fastIntent(text, stage);
  if (fast && fast.confidence >= 0.85) return fast;

  const svc = services ?? (await getServices());
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch("http://127.0.0.1:8090/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        stage,
        services: svc.map((s) => ({
          service_id: s.service_id,
          service_name: s.service_name,
          category: s.category,
        })),
      }),
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (r.ok) {
      const j = (await r.json()) as {
        intent?: string;
        service_candidate?: string;
        confidence?: number;
        source?: string;
      };
      const intent = INTENTS.includes(j.intent as Intent) ? (j.intent as Intent) : "UNKNOWN";
      const cand = svc.find((s) => s.service_id === j.service_candidate);
      const out: IntentResult = {
        intent,
        serviceCandidate: cand ? cand.service_id : "",
        confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)),
        source: j.source === "keyword" ? "keyword" : "ai",
      };
      // cross-check: AI service claim ko fuzzy matcher se verify karo (never invent)
      if (out.serviceCandidate) {
        const m = matchService(text, svc);
        if (!m || m.svc.service_id !== out.serviceCandidate) {
          // AI ka candidate text se match nahi karta — matcher pe bharosa karo
          if (m && out.intent === "START_APPLICATION") out.serviceCandidate = m.svc.service_id;
          else if (!m) out.serviceCandidate = "";
        }
      }
      if (fast && (out.intent === "UNKNOWN" || out.confidence < fast.confidence)) {
        return { ...fast, confidence: Math.max(fast.confidence, 0.8) };
      }
      return out;
    }
  } catch {
    // agent down → fast/keyword path
  }

  if (fast) return fast;

  // local keyword fallback (agent unavailable)
  const m = matchService(text, svc);
  if (m && m.score >= 0.75)
    return { intent: "START_APPLICATION", serviceCandidate: m.svc.service_id, confidence: m.score, source: "keyword" };
  if (m && m.score >= 0.5)
    return { intent: "SERVICE_DISCOVERY", serviceCandidate: m.svc.service_id, confidence: m.score, source: "keyword" };
  return { intent: "UNKNOWN", serviceCandidate: "", confidence: 0.2, source: "keyword" };
}
