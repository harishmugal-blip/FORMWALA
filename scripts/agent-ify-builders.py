#!/usr/bin/env python3
"""PURAA AGENT build: patch all structural message builders (CSC 06 + CSC 08)
to call ai-agent /compose for natural Hinglish. Template stays as fallback."""
import json
import re
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

# standard ending: "let _out = msg;" + custom compose lines + return
TAIL = "return [{ json: { reply: _out, phone: {PHONE} } }];"


def set_code(wf, node_name, new_code, label):
    node = next(n for n in wf["nodes"] if n["name"] == node_name)
    if "aiCompose" in node["parameters"]["jsCode"]:
        print(f"  = {node_name} already patched")
        return False
    node["parameters"]["jsCode"] = new_code
    save_wf(wf)
    print(f"  + {node_name} -> {label}")
    return True


def patch_simple(wf_id, node_name, kind, payload_expr):
    """For nodes ending with: return [{ json: { reply: msg, phone: X } }];"""
    wf = api(f"/api/v1/workflows/{wf_id}")
    node = next(n for n in wf["nodes"] if n["name"] == node_name)
    code = node["parameters"]["jsCode"]
    if "aiCompose" in code:
        print(f"  = {node_name} already patched")
        return
    m = re.search(r"return \[\{ json: \{ reply: msg, phone: ([\w.]+) \} \}\s*\];", code)
    if not m:
        raise ValueError(f"{node_name}: return pattern not found")
    phone = m.group(1)
    call = f"_out = await aiCompose('{kind}', {phone}, _out, {payload_expr});"
    new_code = COMPOSE_HELPER + code[:m.start()] + f"let _out = msg;\n{call}\n" + TAIL.replace("{PHONE}", phone)
    node["parameters"]["jsCode"] = new_code
    save_wf(wf)
    print(f"  + {node_name} -> {kind}")


CSC06 = "3c5c0606-0000-4000-8000-000000000006"
CSC08 = "3c5c0808-0000-4000-8000-000000000008"

print("== CSC 06 ==")

# 1. Ask First Question -> field_start
patch_simple(CSC06, "Ask First Question", "field_start",
             "{ service_name: (svc.service_name || cs.service_id), field_question: (first.question || first.label), field_options: (first.options || '') }")

# 2. Ask Next Question -> field_question (with prev answer ack)
wf = api(f"/api/v1/workflows/{CSC06}")
node = next(n for n in wf["nodes"] if n["name"] == "Ask Next Question")
code = node["parameters"]["jsCode"]
if "aiCompose" not in code:
    m = re.search(r"return \[\{ json: \{ reply: msg, phone: ([\w.]+) \} \}\s*\];", code)
    phone = m.group(1)
    prelude = ("const _prevField = (cs.fields || [])[next.nextIdx - 1] || {};\n"
               "let _prevVal = '';\n"
               "try { _prevVal = String($('Save Field Value').first().json.field_value || ''); } catch (e) {}\n")
    payload = ("{ service_name: (cs.service && cs.service.service_name) || cs.service_id, index: (next.nextIdx + 1), "
               "total: (cs.fields || []).length, field_question: (f.question || f.label), field_options: (f.options || ''), "
               "prev_label: (_prevField.label || ''), prev_value: _prevVal }")
    call = f"_out = await aiCompose('field_question', {phone}, _out, {payload});"
    new_code = COMPOSE_HELPER + prelude + code[:m.start()] + f"let _out = msg;\n{call}\n" + TAIL.replace("{PHONE}", phone)
    node["parameters"]["jsCode"] = new_code
    save_wf(wf)
    print("  + Ask Next Question -> field_question (with prev ack)")

# 3. Build Doc Message -> docs_intro
wf = api(f"/api/v1/workflows/{CSC06}")
node = next(n for n in wf["nodes"] if n["name"] == "Build Doc Message")
code = node["parameters"]["jsCode"]
if "aiCompose" not in code:
    m = re.search(r"return \[\{ json: \{ reply: msg, phone: ([\w.]+) \} \}\s*\];", code)
    phone = m.group(1)
    prelude = "const _docsList = docs.map((d, i) => (i + 1) + '. ' + (d.label || d.doc_key) + ' - ' + (d.question || 'photo bhejein')).join('\\n');\n"
    call = f"_out = await aiCompose('docs_intro', {phone}, _out, {{ service_name: (svc.service_name || ''), docs_list: _docsList }});"
    new_code = COMPOSE_HELPER + prelude + code[:m.start()] + f"let _out = msg;\n{call}\n" + TAIL.replace("{PHONE}", phone)
    node["parameters"]["jsCode"] = new_code
    save_wf(wf)
    print("  + Build Doc Message -> docs_intro")

# 4. Payment Wait Note -> payment_note
patch_simple(CSC06, "Payment Wait Note", "payment_note",
             "{ service_name: (cs.service && cs.service.service_name) || cs.service_id }")

print("== CSC 08 ==")

# 5. Remind Next Doc -> doc_ask (guarded: only when next doc exists)
wf = api(f"/api/v1/workflows/{CSC08}")
node = next(n for n in wf["nodes"] if n["name"] == "Remind Next Doc")
code = node["parameters"]["jsCode"]
if "aiCompose" not in code:
    m = re.search(r"return \[\{ json: \{ reply: msg, phone: ([\w.]+) \} \}\s*\];", code)
    phone = m.group(1)
    payload = ("{ service_name: (m.service && m.service.service_name) || '', doc_label: (d.label || d.doc_key), "
               "doc_question: (d.question || 'Photo/PDF bhejein.'), saved: m.savedCount, "
               "total: (m.savedCount + (m.missing || []).length) }")
    call = f"if (d) _out = await aiCompose('doc_ask', {phone}, _out, {payload});"
    new_code = COMPOSE_HELPER + code[:m.start()] + f"let _out = msg;\n{call}\n" + TAIL.replace("{PHONE}", phone)
    node["parameters"]["jsCode"] = new_code
    save_wf(wf)
    print("  + Remind Next Doc -> doc_ask (guarded)")

# 6. Next Doc Ask -> doc_ack (full rewrite: original reply was inline expression)
wf = api(f"/api/v1/workflows/{CSC08}")
node = next(n for n in wf["nodes"] if n["name"] == "Next Doc Ask")
code = node["parameters"]["jsCode"]
if "aiCompose" not in code:
    body_code = """const u = $('Update Doc Locally').first().json;
const m = $('Match Next Doc').first().json;
let msg = '\\u2705 Document mil gaya (' + u.savedCount + '/' + u.total + ').\\n\\nAgla document bhejein. Kaam ho jaye to kuch na type karein - main khud aage badha dunga.';
"""
    payload = "{ service_name: (m.service && m.service.service_name) || '', saved: u.savedCount, total: u.total }"
    call = f"_out = await aiCompose('doc_ack', u.phone, _out, {payload});"
    new_code = COMPOSE_HELPER + body_code + f"let _out = msg;\n{call}\n" + TAIL.replace("{PHONE}", "u.phone")
    node["parameters"]["jsCode"] = new_code
    save_wf(wf)
    print("  + Next Doc Ask -> doc_ack")

print("DONE: all builders compose-wired")
