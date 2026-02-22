#!/usr/bin/env python3
"""Fetch key JS files from kangurmatematyczny.org"""

import requests
import os

BASE_URL = "https://www.kangurmatematyczny.org"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "discovered")
EMAIL = "mwatola@gmail.com"
PASSWORD = "s@z6zUs2qK8UHi"

os.makedirs(OUTPUT_DIR, exist_ok=True)

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
})

# Login
resp = session.post(f"{BASE_URL}/login/do_login", data={"email": EMAIL, "password": PASSWORD})
print(f"Login: {resp.status_code}")

# Fetch JS files
js_files = [
    "/res/js/zadania.js",
    "/res/js/basic.js",
    "/res/js/jszip-utils.js",
]

for js in js_files:
    resp = session.get(f"{BASE_URL}{js}")
    name = js.split("/")[-1]
    filepath = os.path.join(OUTPUT_DIR, name)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(resp.text)
    print(f"Saved {name}: {len(resp.text)} bytes")

# Also try to call the API that zadania.start() might use
# Try common patterns
api_endpoints = [
    "/tests/list",
    "/tests/getlist",
    "/tests/categories",
    "/tests/getcategories",
    "/tests/available",
    "/tests/getavailable",
    "/zadania/list",
    "/zadania/getlist",
    "/api/tests",
    "/api/zadania",
    "/tests/tests",
    "/tests/gettests",
    "/tests/gettests/1",  # category 1 = Żaczek
    "/tests/list/1",
    "/tests/getlist/1",
]

print("\nTrying API endpoints:")
for ep in api_endpoints:
    resp = session.get(f"{BASE_URL}{ep}")
    if resp.status_code == 200:
        text = resp.text[:200].strip()
        if text and "BŁĄD" not in text and "Błędny" not in text:
            print(f"  [+] {ep} -> {resp.status_code} ({len(resp.text)} bytes)")
            print(f"      {text[:150]}")
            filepath = os.path.join(OUTPUT_DIR, f"api_{ep.strip('/').replace('/', '_')}.json")
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(resp.text)
