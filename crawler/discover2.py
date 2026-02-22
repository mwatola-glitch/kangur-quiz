#!/usr/bin/env python3
"""
Kangur Matematyczny - Discovery Crawler v2
Focuses on actual navigation paths found in the menu.
"""

import requests
from bs4 import BeautifulSoup
import os
import json
import re

BASE_URL = "https://www.kangurmatematyczny.org"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "discovered")

EMAIL = os.environ.get("KANGUR_EMAIL", "mwatola@gmail.com")
PASSWORD = os.environ.get("KANGUR_PASSWORD", "s@z6zUs2qK8UHi")

os.makedirs(OUTPUT_DIR, exist_ok=True)


def login(session):
    resp = session.post(
        f"{BASE_URL}/login/do_login",
        data={"email": EMAIL, "password": PASSWORD},
        allow_redirects=True
    )
    soup = BeautifulSoup(resp.text, "lxml")
    logout_link = soup.find("a", href=lambda h: h and "logout" in h.lower() if h else False)
    if logout_link:
        print("[+] Login successful!")
        return True, resp
    return False, resp


def save_and_analyze(resp, name, verbose=True):
    """Save HTML and analyze content"""
    soup = BeautifulSoup(resp.text, "lxml")
    filepath = os.path.join(OUTPUT_DIR, f"{name}.html")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(resp.text)

    # Check for errors
    alerts = soup.find_all(class_=lambda c: c and "alert" in c if c else False)
    for alert in alerts:
        txt = alert.get_text(strip=True)
        if "BŁĄD" in txt or "błąd" in txt:
            print(f"    [!] Error: {txt[:100]}")
            return soup

    # Find the main content
    # Try different content selectors
    content = soup.find(class_="main") or soup.find(class_="content")
    breadcrumb = soup.find(class_="breadcrumb")
    if breadcrumb:
        print(f"    Breadcrumb: {breadcrumb.get_text(strip=True)}")

    if content and verbose:
        text = content.get_text(separator="\n", strip=True)
        if text:
            lines = [l for l in text.split("\n") if l.strip()][:20]
            for line in lines:
                print(f"    | {line[:100]}")

    # Find all links
    all_links = soup.find_all("a", href=True)
    interesting = set()
    for a in all_links:
        href = a["href"]
        if href.startswith("/") and len(href) > 1:
            interesting.add(href)

    # Find JavaScript variables
    scripts = soup.find_all("script")
    for script in scripts:
        if script.string and len(script.string) > 100:
            # Look for interesting patterns
            text = script.string
            for pattern in [r'var\s+(\w+)\s*=\s*\{', r'var\s+(\w+)\s*=\s*\[', r'function\s+(\w+)', r'"url"\s*:\s*"([^"]+)"', r"'url'\s*:\s*'([^']+)'", r'action\s*:\s*"([^"]+)"']:
                matches = re.findall(pattern, text)
                if matches:
                    print(f"    JS: {pattern} -> {matches[:5]}")

    return soup


def explore(session, path, name=None, verbose=True):
    """Fetch and analyze a page"""
    url = f"{BASE_URL}{path}"
    if not name:
        name = path.strip("/").replace("/", "_") or "root"
    print(f"\n[*] {path}")
    resp = session.get(url, allow_redirects=True)
    final = resp.url.replace(BASE_URL, "")
    if final != path:
        print(f"    -> Redirected to: {final}")
    return save_and_analyze(resp, name, verbose)


def main():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    })

    ok, resp = login(session)
    if not ok:
        print("[!] Login failed!")
        return

    # Save homepage after login
    save_and_analyze(resp, "homepage_loggedin")

    # Explore navigation paths
    paths = [
        "/zadania",
        "/profile",
        "/order",
        "/wyniki",
        "/volumelicense",
        # Try different task URL patterns
        "/zadania/1",       # category ID 1 = Żaczek
        "/zadania/zaczek",
        "/zadania/2024",    # year
        "/zadania/1/2024",  # category/year
        "/zadania/zaczek/2024",
        "/zadania/1/1",     # category/task?
    ]

    for path in paths:
        try:
            explore(session, path)
        except Exception as e:
            print(f"    ERROR: {e}")

    # Now look at the /zadania page in detail
    print("\n\n" + "=" * 60)
    print("Analyzing /zadania in detail...")
    soup = explore(session, "/zadania", "zadania_detail")

    # Find ALL links and buttons on /zadania
    if soup:
        print("\n  All links on /zadania:")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            text = a.get_text(strip=True)[:60]
            if text and href != "#":
                print(f"    {href} -> {text}")

        print("\n  All buttons on /zadania:")
        for btn in soup.find_all("button"):
            text = btn.get_text(strip=True)[:60]
            action = btn.get("action", "")
            onclick = btn.get("onclick", "")
            print(f"    action={action} onclick={onclick} -> {text}")

        # Check for AJAX endpoints in scripts
        print("\n  AJAX endpoints:")
        for script in soup.find_all("script"):
            if script.string:
                for match in re.findall(r'(?:url|href|action|src)\s*[:=]\s*["\']([^"\']+)["\']', script.string):
                    if match.startswith("/"):
                        print(f"    {match}")


if __name__ == "__main__":
    main()
