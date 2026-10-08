#!/usr/bin/env python3
"""Fix Ask Next Question + Build Doc Message: prelude must run AFTER original vars."""
import json
import urllib.request

API = "http://127.0.0.1:5678"
KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
HDR = {"X-N8N-API-KEY": KEY, "content-type": "application/json"}


def api(path, method="GET", body=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body else None, headers=HDR)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def save_wf(wf):
    body = {"name": wf["name"], "nodes": wf["nodes"], "connections": wf["connections"], "settings": wf.get("settings", {})}
    api(f"/api/v1/workflows/{wf['id']}", method="PUT", body=body)
    try:
        api(f"/api/v1/workflows/{wf['id']}/activate", method="POST")
    except Exception as e:
        print("  activate:", str(e)[:100])


COMPOSE_HELPER = """// AI compose: natural Hinglish version (template fallback if AI down)
async function aiCompose(kind, phone, draft, payload) {
  try {
    const ai = await this.helpers.httpRequest({
      method: 'POST', url: 'http://127.0.0.1:8090/compose',
      body: { kind, phone, draft, payload },
      headers: { 'content-type': 'application/json' }, json: true, timeout: 30000,
    });
    if (ai && ai.text) return String(ai.text);
  } catch (e) {}
  return draft;
}
"""

TAIL = "return [{ json: { reply: _out, phone: {PHONE} } }];"

ORIG_ASK_NEXT = """const cs = $('Compute Step').first().json;
const next = $('Next Or Done').first().json;
const f = (cs.fields || [])[next.nextIdx] || {};
let msg = '\\ud83d\\udcdd Sawal ' + (next.nextIdx + 1) + '/' + (cs.fields || []).length + ': ' + (f.question || f.label);
if ((f.options || '').trim()) msg += ' (' + f.options.split(',').join(' / ') + ')';"""

NEW_ASK_NEXT = COMPOSE_HELPER + ORIG_ASK_NEXT + """
const _prevField = (cs.fields || [])[next.nextIdx - 1] || {};
let _prevVal = '';
try { _prevVal = String($('Save Field Value').first().json.field_value || ''); } catch (e) {}
let _out = msg;
_out = await aiCompose('field_question', cs.phone, _out, { service_name: (cs.service && cs.service.service_name) || cs.service_id, index: (next.nextIdx + 1), total: (cs.fields || []).length, field_question: (f.question || f.label), field_options: (f.options || ''), prev_label: (_prevField.label || ''), prev_value: _prevVal });
""" + TAIL.replace("{PHONE}", "cs.phone")

ORIG_BUILD_DOC = """const cs = $('Compute Step').first().json;
const docs = cs.docs || [];
const svc = cs.service || {};
let msg = '\\u2705 Sari details mil gayi hain \\ud83d\\udcd1\\n\\n';
msg += 'Ab documents chahiye (' + docs.length + ' items) - "' + (svc.service_name || '') + '" ke liye:\\n';
docs.forEach((d, i) => { msg += '\\n' + (i + 1) + '. \\ud83d\\udcc4 ' + (d.label || d.doc_key) + ' - ' + (d.question || 'photo bhejein'); });
msg += '\\n\\nEk-ek karke photo/PDF bhejein. Sab mil jane ke baad payment link milega.\\nCANCEL likhein to band ho jayega.';"""

NEW_BUILD_DOC = COMPOSE_HELPER + ORIG_BUILD_DOC + """
const _docsList = docs.map((d, i) => (i + 1) + '. ' + (d.label || d.doc_key) + ' - ' + (d.question || 'photo bhejein')).join('\\n');
let _out = msg;
_out = await aiCompose('docs_intro', cs.phone, _out, { service_name: (svc.service_name || ''), docs_list: _docsList });
""" + TAIL.replace("{PHONE}", "cs.phone")

CSC06 = "3c5c0606-0000-4000-8000-000000000006"

wf = api(f"/api/v1/workflows/{CSC06}")
n = next(x for x in wf["nodes"] if x["name"] == "Ask Next Question")
n["parameters"]["jsCode"] = NEW_ASK_NEXT
print("Ask Next Question rebuilt")
n2 = next(x for x in wf["nodes"] if x["name"] == "Build Doc Message")
n2["parameters"]["jsCode"] = NEW_BUILD_DOC
print("Build Doc Message rebuilt")
save_wf(wf)
print("DONE")
