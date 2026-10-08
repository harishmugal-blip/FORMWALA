#!/usr/bin/env python3
"""Setup n8n owner account + create API key for CSC restore."""
import json, urllib.request, http.cookiejar

BASE = "http://localhost:5678"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def req(method, path, data=None, headers=None):
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(BASE + path, data=body, method=method)
    r.add_header("Content-Type", "application/json")
    r.add_header("Browser-ID", "csc-setup-browser")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        resp = opener.open(r, timeout=30)
        raw = resp.read().decode()
        return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except: return e.code, {"raw": raw[:300]}
    except Exception as e:
        return 0, {"error": str(e)}

# 1. Check if owner setup needed
code, data = req("GET", "/rest/owner/setup")
print("1. owner/setup GET:", code, str(data)[:120])

if code == 200:
    email = "admin@csc.local"
    password = "CscAdmin#2026"
    # 2. Create owner
    code, data = req("POST", "/rest/owner/setup", {
        "email": email, "password": password,
        "firstName": "CSC", "lastName": "Admin"
    })
    print("2. owner/setup POST:", code, str(data)[:150])

# 3. Login (get n8n-auth cookie)
code, data = req("POST", "/rest/login", {
    "emailOrLdapLoginId": "admin@csc.local",
    "password": "CscAdmin#2026"
})
print("3. login:", code, str(data)[:120])

# 4. Create public API key
code, data = req("POST", "/rest/api-keys", {"label": "csc-restore"})
print("4. api-key create:", code, str(data)[:200])

# Save results
out = {"apiKey": None}
if isinstance(data, dict):
    out["apiKey"] = data.get("data", {}).get("apiKey") or data.get("apiKey")
    out["rawKeys"] = data
with open("/home/z/my-project/scripts/n8n-auth.json", "w") as f:
    json.dump(out, f, indent=2)
print("5. API KEY:", (out["apiKey"] or "NOT CREATED")[:50])
