#!/usr/bin/env python3
"""
Build the final index.html by replacing the <script> section
with new JS logic + electronic quiz data.
"""
import os
import json
import re

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Read HTML
html_path = os.path.join(PROJECT_DIR, "index.html")
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Read new JS logic
js_path = os.path.join(PROJECT_DIR, "app_logic.js")
with open(js_path, "r", encoding="utf-8") as f:
    js_code = f.read()

# Read electronic data JSON
data_path = os.path.join(PROJECT_DIR, "kangur_electronic.json")
with open(data_path, "r", encoding="utf-8") as f:
    data_json = f.read()

# Escape </ sequences to prevent HTML parser from breaking <script> block
data_json = data_json.replace("</", "<\\/")

# Replace placeholder in JS
js_code = js_code.replace("PLACEHOLDER_QUIZ_DATA", data_json, 1)

# Find and replace the <script> block in HTML
start = html.find('<script>')
end = html.rfind('</script>') + len('</script>')
if start != -1 and end != -1:
    new_html = html[:start] + f'<script>\n{js_code}\n</script>' + html[end:]
else:
    print("[!] Could not find script tags!")
    exit(1)

# Write output
with open(html_path, "w", encoding="utf-8") as f:
    f.write(new_html)

size = os.path.getsize(html_path)
print(f"[+] index.html updated: {size/1024:.1f} KB")
print(f"    JS logic: {len(js_code)/1024:.1f} KB (including {len(data_json)/1024:.1f} KB data)")
