#!/usr/bin/env python3
"""
Kangur Matematyczny - Full Crawler
Pobiera zadania w wersji elektronicznej z kangurmatematyczny.org
i zapisuje w formacie gotowym do użycia w aplikacji quizowej.

Wymagania: requests, beautifulsoup4, lxml
"""

import requests
from bs4 import BeautifulSoup
import os
import sys
import json
import base64
import zipfile
import io
import re
import html

BASE_URL = "https://www.kangurmatematyczny.org"
EMAIL = os.environ.get("KANGUR_EMAIL", "")
PASSWORD = os.environ.get("KANGUR_PASSWORD", "")

# Output directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(PROJECT_DIR, "data_electronic")

# Categories to crawl
CATEGORIES = {
    "zaczek": {"match": "aczek", "name": "Żaczek", "subtitle": "klasy 1 i 2"},
    "maluch": {"match": "aluch", "name": "Maluch", "subtitle": "klasy 3 i 4"},
}


def base64_decode_text(encoded):
    """Decode base64-encoded UTF-8 text (MathML or plain text)"""
    try:
        return base64.b64decode(encoded).decode("utf-8")
    except Exception:
        return encoded


class KangurCrawler:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "X-Requested-With": "XMLHttpRequest",
        })

    def login(self):
        """Log into the site"""
        print(f"[*] Logowanie jako {EMAIL}...")
        resp = self.session.post(
            f"{BASE_URL}/login/do_login",
            data={"email": EMAIL, "password": PASSWORD},
            allow_redirects=True
        )
        soup = BeautifulSoup(resp.text, "lxml")
        if soup.find("a", href=lambda h: h and "logout" in h.lower() if h else False):
            print("[+] Zalogowano pomyślnie!")
            return True
        print("[!] Logowanie nie powiodło się!")
        return False

    def api_post(self, endpoint, data=None):
        """Make a POST request to the tests API"""
        resp = self.session.post(
            f"{BASE_URL}/tests/{endpoint}",
            data=data or {}
        )
        try:
            return json.loads(resp.text)
        except json.JSONDecodeError:
            print(f"    [!] Nieprawidłowa odpowiedź JSON z {endpoint}: {resp.text[:200]}")
            return None

    def load_categories(self):
        """Load available categories"""
        print("\n[*] Ładowanie kategorii...")
        data = self.api_post("load_categories")
        if not data:
            print("[!] Brak kategorii")
            return []

        categories = []
        for cat in data:
            print(f"    Kategoria: {cat['name']} (ID: {cat['id']}, sname: {cat.get('sname', '?')})")
            categories.append(cat)
        return categories

    def load_years(self, cat_id):
        """Load available years for a category"""
        data = self.api_post("load_category", {"cat_id": cat_id})
        if not data or data.get("ad"):
            print(f"    [!] Brak dostępu do kategorii {cat_id}")
            return None

        years = []
        for y in data.get("years", []):
            years.append({"id": y["id"], "year": int(y["year"])})
        return {"id": data["id"], "name": data["name"], "years": years}

    def start_practice(self, cat_id, year_id):
        """Start a practice session (gives us all the data)"""
        data = self.api_post("start_contest", {
            "cat_id": cat_id,
            "year_id": year_id,
            "contest": 0  # 0 = practice (gives both questions + answers)
        })
        if not data or data.get("ad"):
            print(f"    [!] Nie można rozpocząć treningu")
            return None
        return data

    def download_zip(self, filename):
        """Download a ZIP file from the data directory"""
        url = f"{BASE_URL}/data/{filename}.zip"
        print(f"    Pobieranie {url}...")
        resp = self.session.get(url)
        if resp.status_code != 200:
            print(f"    [!] Błąd pobierania ZIP: {resp.status_code}")
            return None
        return resp.content

    def extract_zip(self, zip_data):
        """Extract a ZIP file and return contents as dict"""
        if not zip_data:
            return {}
        zf = zipfile.ZipFile(io.BytesIO(zip_data))
        contents = {}
        for name in zf.namelist():
            contents[name] = zf.read(name)
        print(f"    ZIP zawiera {len(contents)} plików: {list(contents.keys())[:5]}...")
        return contents

    def decode_answer(self, encoded_value, question_index):
        """Decode XOR-encoded correct answer"""
        shift = 0xAA + question_index
        option_index = encoded_value ^ shift
        letters = ["A", "B", "C", "D", "E", "F", "G"]
        if 0 <= option_index < len(letters):
            return letters[option_index]
        return f"?({option_index})"

    def parse_content(self, item, zip_contents):
        """Parse a question/option/solution content item.
        Returns dict with 'type' ('text'|'image'|'mathml'), 'content', and optionally 'image_data'
        """
        if item["T"] == "F":
            # File/image in ZIP
            filename = item["D"]
            ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
            image_data = zip_contents.get(filename)
            if image_data:
                b64 = base64.b64encode(image_data).decode("ascii")
                return {
                    "type": "image",
                    "filename": filename,
                    "ext": ext,
                    "data_uri": f"data:image/{ext};base64,{b64}",
                    "raw_bytes": image_data
                }
            else:
                return {"type": "image", "filename": filename, "error": "not found in ZIP"}
        else:
            # Base64-encoded text (usually MathML)
            decoded = base64_decode_text(item["D"])
            # Check if it's MathML
            if "<math" in decoded or "<mml:" in decoded:
                return {"type": "mathml", "content": decoded}
            else:
                return {"type": "text", "content": decoded}

    def extract_text_from_mathml(self, mathml_str):
        """Extract readable text from MathML, stripping tags"""
        # Remove MathML tags but keep text content
        soup = BeautifulSoup(mathml_str, "html.parser")
        return soup.get_text()

    def process_year(self, cat_id, year_id, year_num):
        """Process all tasks for a given year"""
        print(f"\n{'='*60}")
        print(f"  Rok {year_num} (year_id={year_id})")
        print(f"{'='*60}")

        # Start practice to get all data
        contest_data = self.start_practice(cat_id, year_id)
        if not contest_data:
            return None

        info = contest_data["info"]
        print(f"    Liczba zadań: {info['count']}")
        print(f"    Grupy: {info['noquestion_1']}/{info['noquestion_2']}/{info['noquestion_3']}")
        print(f"    ZIP pytań: {info['y']}")
        print(f"    ZIP odpowiedzi: {info.get('z', 'brak')}")

        # Download and extract ZIPs
        questions_zip = self.download_zip(info["y"])
        q_contents = self.extract_zip(questions_zip)

        answers_zip = None
        a_contents = {}
        if "z" in info and info["z"]:
            answers_zip = self.download_zip(info["z"])
            a_contents = self.extract_zip(answers_zip)

        # Parse questions
        questions = info["c"]
        correct_answers = questions.get("R", [])
        solutions = questions.get("CA", [])

        tasks = []
        n1 = int(info["noquestion_1"])
        n2 = int(info["noquestion_2"])

        for i in range(int(info["count"])):
            q_num = i + 1
            q = questions[str(q_num)] if str(q_num) in questions else questions.get(q_num)

            if not q:
                print(f"    [!] Brak pytania {q_num}")
                continue

            # Determine difficulty and points
            if i < n1:
                difficulty = "easy"
                points = 3
            elif i < n1 + n2:
                difficulty = "medium"
                points = 4
            else:
                difficulty = "hard"
                points = 5

            # Parse question content
            q_content = self.parse_content(q, q_contents)

            # Parse options
            options = []
            letters = ["A", "B", "C", "D", "E"]
            for j, opt in enumerate(q.get("O", [])):
                opt_content = self.parse_content(opt, q_contents)
                options.append({
                    "letter": letters[j] if j < len(letters) else f"?{j}",
                    **opt_content
                })

            # Decode correct answer
            correct = self.decode_answer(correct_answers[i], i) if i < len(correct_answers) else "?"

            # Parse solution (if available)
            solution = None
            if i < len(solutions) and solutions[i]:
                solution = self.parse_content(solutions[i], a_contents)

            task = {
                "number": q_num,
                "points": points,
                "difficulty": difficulty,
                "question": q_content,
                "options": options,
                "correct_answer": correct,
                "solution": solution
            }
            tasks.append(task)

            # Status
            q_type = q_content["type"]
            opts_types = [o["type"] for o in options]
            print(f"    Zadanie {q_num}: {q_type}, opcje: {opts_types}, odpowiedź: {correct}")

        return {
            "year": year_num,
            "count": int(info["count"]),
            "groups": [n1, n2, int(info["noquestion_3"])],
            "tasks": tasks,
            "zip_questions": info["y"],
            "zip_answers": info.get("z"),
        }

    def save_year_data(self, year_num, year_data, category_slug="zaczek"):
        """Save processed year data"""
        year_dir = os.path.join(OUTPUT_DIR, category_slug, str(year_num))
        os.makedirs(year_dir, exist_ok=True)
        images_dir = os.path.join(year_dir, "images")
        os.makedirs(images_dir, exist_ok=True)

        # Save images separately and replace data_uri with file paths
        for task in year_data["tasks"]:
            q = task["question"]
            if q.get("type") == "image" and q.get("raw_bytes"):
                img_name = f"q{task['number']:02d}.{q.get('ext', 'png')}"
                img_path = os.path.join(images_dir, img_name)
                with open(img_path, "wb") as f:
                    f.write(q["raw_bytes"])
                q["image_file"] = f"images/{img_name}"
                del q["raw_bytes"]

            for opt in task["options"]:
                if opt.get("type") == "image" and opt.get("raw_bytes"):
                    img_name = f"q{task['number']:02d}_{opt['letter']}.{opt.get('ext', 'png')}"
                    img_path = os.path.join(images_dir, img_name)
                    with open(img_path, "wb") as f:
                        f.write(opt["raw_bytes"])
                    opt["image_file"] = f"images/{img_name}"
                    del opt["raw_bytes"]

            if task.get("solution"):
                sol = task["solution"]
                if sol.get("type") == "image" and sol.get("raw_bytes"):
                    img_name = f"sol{task['number']:02d}.{sol.get('ext', 'png')}"
                    img_path = os.path.join(images_dir, img_name)
                    with open(img_path, "wb") as f:
                        f.write(sol["raw_bytes"])
                    sol["image_file"] = f"images/{img_name}"
                    del sol["raw_bytes"]

        # Save JSON (without raw bytes)
        json_path = os.path.join(year_dir, "tasks_electronic.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(year_data, f, ensure_ascii=False, indent=2)
        print(f"\n    Zapisano do {json_path}")

        # Also save raw contest info for debugging
        return year_dir

    def run(self, only_category=None):
        """Main crawl loop. If only_category is set, crawl only that category slug."""
        if not self.login():
            return

        categories = self.load_categories()
        os.makedirs(OUTPUT_DIR, exist_ok=True)

        cats_to_crawl = {only_category: CATEGORIES[only_category]} if only_category else CATEGORIES

        for slug, config in cats_to_crawl.items():
            # Find category by substring match
            found = None
            for cat in categories:
                if config["match"] in cat.get("name", "").lower() or config["match"] in cat.get("sname", "").lower():
                    found = cat
                    break

            if not found:
                print(f"[!] Nie znaleziono kategorii {config['name']}!")
                print(f"    Dostępne: {[c.get('name') for c in categories]}")
                continue

            print(f"\n[*] Znaleziono {config['name']}: ID={found['id']}")

            cat_data = self.load_years(found["id"])
            if not cat_data:
                continue

            print(f"    Dostępne lata: {[y['year'] for y in cat_data['years']]}")

            results = {}
            for year_info in sorted(cat_data["years"], key=lambda y: y["year"]):
                year_num = year_info["year"]
                year_id = year_info["id"]

                try:
                    year_data = self.process_year(found["id"], year_id, year_num)
                    if year_data:
                        self.save_year_data(year_num, year_data, slug)
                        results[year_num] = {
                            "tasks": len(year_data["tasks"]),
                            "status": "OK"
                        }
                    else:
                        results[year_num] = {"status": "FAILED"}
                except Exception as e:
                    print(f"\n    [!] Błąd przetwarzania roku {year_num}: {e}")
                    import traceback
                    traceback.print_exc()
                    results[year_num] = {"status": f"ERROR: {e}"}

            print(f"\n{'='*60}")
            print(f"PODSUMOWANIE — {config['name']}")
            print(f"{'='*60}")
            for year, status in sorted(results.items()):
                print(f"  {year}: {status}")

        print(f"\nDane zapisane w: {OUTPUT_DIR}")


if __name__ == "__main__":
    crawler = KangurCrawler()
    # Optional: crawl only one category (e.g. python crawl.py maluch)
    only = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in CATEGORIES else None
    if only:
        print(f"[*] Crawlowanie tylko kategorii: {CATEGORIES[only]['name']}")
    crawler.run(only_category=only)
