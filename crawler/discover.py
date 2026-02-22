#!/usr/bin/env python3
"""
Kangur Matematyczny - Discovery Crawler
Loguje się na kangurmatematyczny.org i odkrywa strukturę stron z zadaniami.
Zapisuje surowy HTML do plików do analizy.
"""

import requests
from bs4 import BeautifulSoup
import os
import sys
import json

BASE_URL = "https://www.kangurmatematyczny.org"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "discovered")

# Credentials from env or hardcoded (user provided explicitly)
EMAIL = os.environ.get("KANGUR_EMAIL", "mwatola@gmail.com")
PASSWORD = os.environ.get("KANGUR_PASSWORD", "s@z6zUs2qK8UHi")

PAGES_TO_EXPLORE = [
    "/dashboard",
    "/testy",
    "/moje-testy",
    "/rozwiaz",
    "/exam",
    "/start",
    "/konkurs",
    "/historia",
    "/results",
    "/licencje",
    "/zamowienia",
    "/profil",
    "/user/dashboard",
    "/user/tests",
    # Żaczek specific
    "/sklep/zaczek",
    "/testy/zaczek",
    "/testy/1",
    "/rozwiaz/zaczek",
    "/rozwiaz/1",
    "/exam/zaczek",
    "/exam/1",
    "/start/zaczek",
    "/start/1",
]


def login(session):
    """Log into kangurmatematyczny.org"""
    print(f"[*] Logging in as {EMAIL}...")

    resp = session.post(
        f"{BASE_URL}/login/do_login",
        data={"email": EMAIL, "password": PASSWORD},
        allow_redirects=True
    )

    print(f"    Status: {resp.status_code}")
    print(f"    Final URL: {resp.url}")
    print(f"    Cookies: {dict(session.cookies)}")

    # Check if login succeeded
    soup = BeautifulSoup(resp.text, "lxml")

    # Look for login indicators
    logout_link = soup.find("a", href=lambda h: h and "logout" in h.lower() if h else False)
    if logout_link:
        print("    [+] Login successful! (found logout link)")
        return True

    # Check for error messages
    alerts = soup.find_all(class_=lambda c: c and "alert" in c if c else False)
    for alert in alerts:
        print(f"    [!] Alert: {alert.get_text(strip=True)}")

    # Save the response for manual inspection
    save_html(resp.text, "login_response")

    # Check page title or body content
    title = soup.title.string if soup.title else "No title"
    print(f"    Page title: {title}")

    return resp.status_code == 200


def save_html(html, name):
    """Save HTML to file for analysis"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, f"{name}.html")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"    Saved to {filepath}")


def explore_page(session, path):
    """Fetch and analyze an authenticated page"""
    url = f"{BASE_URL}{path}"
    print(f"\n[*] Exploring {path}...")

    resp = session.get(url, allow_redirects=True)
    final_path = resp.url.replace(BASE_URL, "")

    if resp.url != url:
        print(f"    Redirected to: {final_path}")

    print(f"    Status: {resp.status_code}")

    soup = BeautifulSoup(resp.text, "lxml")
    title = soup.title.string if soup.title else "No title"
    print(f"    Title: {title}")

    # Find main content area
    main = soup.find("main") or soup.find(id="content") or soup.find(class_="content") or soup.find(class_="container")
    if main:
        text = main.get_text(separator="\n", strip=True)
        # Show first 500 chars
        preview = text[:500]
        if preview.strip():
            print(f"    Content preview:\n      {preview[:300].replace(chr(10), chr(10) + '      ')}")

    # Find links
    links = soup.find_all("a", href=True)
    interesting_links = []
    for a in links:
        href = a["href"]
        if any(kw in href.lower() for kw in ["test", "exam", "rozwiaz", "start", "zadani", "zaczek", "konkurs"]):
            interesting_links.append({"href": href, "text": a.get_text(strip=True)[:60]})

    if interesting_links:
        print(f"    Interesting links ({len(interesting_links)}):")
        for link in interesting_links[:15]:
            print(f"      {link['href']} -> {link['text']}")

    # Find forms
    forms = soup.find_all("form")
    if forms:
        print(f"    Forms ({len(forms)}):")
        for form in forms:
            action = form.get("action", "?")
            method = form.get("method", "GET")
            inputs = [(inp.get("name"), inp.get("type", "text")) for inp in form.find_all("input")]
            print(f"      {method} {action} - inputs: {inputs}")

    # Find scripts with data
    scripts = soup.find_all("script")
    for script in scripts:
        if script.string:
            text = script.string
            for keyword in ["var questions", "var tasks", "var test", "var exam", "var quiz",
                           "taskData", "questionData", "testData", "examData"]:
                if keyword in text:
                    print(f"    [!] Found JS data: '{keyword}' in script tag")
                    # Show context around the keyword
                    idx = text.index(keyword)
                    snippet = text[max(0, idx-20):idx+200]
                    print(f"      ...{snippet}...")

    # Save for manual inspection
    safe_name = path.strip("/").replace("/", "_") or "root"
    save_html(resp.text, safe_name)

    return resp


def main():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })

    # Step 1: Login
    if not login(session):
        print("\n[!] Login might have failed. Check discovered/login_response.html")
        # Continue anyway to see what happens

    # Step 2: Explore authenticated pages
    for path in PAGES_TO_EXPLORE:
        try:
            explore_page(session, path)
        except Exception as e:
            print(f"    ERROR: {e}")

    # Step 3: Summary
    print("\n" + "=" * 60)
    print("Discovery complete! Check HTML files in:")
    print(f"  {OUTPUT_DIR}")
    print("\nLook for:")
    print("  - Test listing pages with year/task links")
    print("  - Individual task page structure")
    print("  - JavaScript data objects with task content")


if __name__ == "__main__":
    main()
