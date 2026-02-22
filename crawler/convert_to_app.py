#!/usr/bin/env python3
"""
Konwertuje dane elektroniczne do formatu JSON dla aplikacji quizowej.
Generuje lekki JSON z ścieżkami do obrazków (nie data URIs).
Obsługuje wiele kategorii (Żaczek, Maluch, ...).
"""

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
ELECTRONIC_DIR = os.path.join(PROJECT_DIR, "data_electronic")
OUTPUT_FILE = os.path.join(PROJECT_DIR, "kangur_electronic.json")

# Map difficulty
DIFF_MAP = {"easy": "e", "medium": "m", "hard": "h"}
POINTS_MAP = {"easy": 3, "medium": 4, "hard": 5}

# Category metadata
CATEGORY_META = {
    "zaczek": {"name": "Żaczek", "subtitle": "klasy 1 i 2", "emoji": "🐣"},
    "maluch": {"name": "Maluch", "subtitle": "klasy 3 i 4", "emoji": "🧒"},
}


def convert_option(opt, year, task_num, category_slug):
    """Convert an option to compact format"""
    if opt["type"] == "text":
        return {"t": "text", "v": opt.get("content", "").strip()}
    elif opt["type"] == "image":
        img_file = opt.get("image_file", "")
        if img_file:
            return {"t": "img", "v": f"data_electronic/{category_slug}/{year}/images/{os.path.basename(img_file)}"}
        # Fallback: data_uri
        if opt.get("data_uri"):
            return {"t": "uri", "v": opt["data_uri"]}
        return {"t": "text", "v": ""}
    elif opt["type"] == "mathml":
        return {"t": "mathml", "v": opt.get("content", "")}
    return {"t": "text", "v": "?"}


def convert_year(year_dir, year_num, category_slug):
    """Convert a year's data to compact format"""
    json_path = os.path.join(year_dir, "tasks_electronic.json")
    if not os.path.exists(json_path):
        return None

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    tasks = []
    for task in data["tasks"]:
        q = task["question"]

        # Question image path
        q_img = None
        if q["type"] == "image" and q.get("image_file"):
            q_img = f"data_electronic/{category_slug}/{year_num}/images/{os.path.basename(q['image_file'])}"
        elif q["type"] == "mathml":
            q_img = None  # Will use MathML content

        # Options
        options = [convert_option(o, year_num, task["number"], category_slug) for o in task["options"]]

        # Solution
        sol = None
        if task.get("solution"):
            s = task["solution"]
            if s["type"] == "image" and s.get("image_file"):
                sol = f"data_electronic/{category_slug}/{year_num}/images/{os.path.basename(s['image_file'])}"

        compact_task = {
            "n": task["number"],
            "p": task["points"],
            "d": DIFF_MAP.get(task["difficulty"], "e"),
            "a": task["correct_answer"],
        }

        # Question content
        if q_img:
            compact_task["qi"] = q_img
        if q["type"] == "mathml":
            compact_task["qm"] = q.get("content", "")
        if q["type"] == "text":
            compact_task["qt"] = q.get("content", "")

        compact_task["o"] = options

        if sol:
            compact_task["s"] = sol

        tasks.append(compact_task)

    return {
        "count": data["count"],
        "groups": data["groups"],
        "tasks": tasks
    }


def main():
    all_data = {}
    total_tasks = 0

    for category_slug in sorted(os.listdir(ELECTRONIC_DIR)):
        cat_path = os.path.join(ELECTRONIC_DIR, category_slug)
        if not os.path.isdir(cat_path):
            continue

        # Check if this is a category dir (has year subdirs with tasks)
        has_year_subdirs = any(
            os.path.isdir(os.path.join(cat_path, y)) and
            os.path.exists(os.path.join(cat_path, y, "tasks_electronic.json"))
            for y in os.listdir(cat_path)
        )
        if not has_year_subdirs:
            continue

        category_data = {}
        cat_tasks = 0

        for year_name in sorted(os.listdir(cat_path)):
            year_path = os.path.join(cat_path, year_name)
            if not os.path.isdir(year_path):
                continue

            result = convert_year(year_path, year_name, category_slug)
            if result:
                category_data[year_name] = result
                cat_tasks += len(result["tasks"])
                print(f"  {category_slug}/{year_name}: {len(result['tasks'])} zadań")

        if category_data:
            meta = CATEGORY_META.get(category_slug, {"name": category_slug, "subtitle": "", "emoji": "📝"})
            all_data[category_slug] = {
                "name": meta["name"],
                "subtitle": meta["subtitle"],
                "emoji": meta["emoji"],
                "years": category_data
            }
            total_tasks += cat_tasks

    # Save
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=True, separators=(",", ":"))

    size = os.path.getsize(OUTPUT_FILE)
    print(f"\nZapisano {OUTPUT_FILE}")
    print(f"  Kategorii: {len(all_data)}")
    print(f"  Zadań łącznie: {total_tasks}")
    print(f"  Rozmiar JSON: {size/1024:.1f} KB")


if __name__ == "__main__":
    main()
