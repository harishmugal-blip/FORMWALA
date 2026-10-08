#!/usr/bin/env python3
"""Login to n8n and create public API key."""
import json, urllib.request, http.cookiejar

BASE = "http://localhost:5678"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def req(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(BASE + path, data=body, method=method)
    r.add_header("Content-Type", "application/json")
    r.add_header("Browser-ID", "csc-setup-browser")
    try:
        resp = opener.open(r, timeout=30)
        raw = resp.read().decode()
        return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except: return e.code, {"raw": raw[:300]}

code, data = req("POST", "/rest/login", {
    "emailOrLdapLoginId": "admin@csc.local", "password": "CscAdmin#2026"})
print("login:", code)

code, data = req("POST", "/rest/api-keys", {"label": "csc-restore"})
print("api-key:", code, str(data)[:150])

key = None
if isinstance(data, dict):
    key = (data.get("data") or {}).get("apiKey") or data.get("apiKey")
with open("/home/z/my-project/scripts/n8n-auth.json", "w") as f:
    json.dump({"apiKey": key}, f, indent=2)
print("KEY:", (key or "FAILED")[:60])

# Also save me id
code, me = req("GET", "/rest/me")
if code == 200 and isinstance(me, dict):
    uid = (me.get("data") or {}).get("id")
    print("userId:", uid)
