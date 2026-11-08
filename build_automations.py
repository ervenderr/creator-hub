#!/usr/bin/env python3
"""Build automations.json from automations/*.json (n8n workflows). Source of truth is the folder."""
import json
from pathlib import Path
HERE = Path(__file__).parent
REPO, BRANCH = "ervenderr/creator-hub", "main"
items = []
for f in sorted((HERE / "automations").glob("*.json")):
    wf = json.loads(f.read_text(encoding="utf-8"))
    m = wf["meta"]
    items.append({"id": f.stem, "name": wf["name"], "category": m["category"], "desc": m["description"],
        "guardrails": m["guardrails"], "steps": [n["name"] for n in wf["nodes"] if n["name"] != "Read me"],
        "source": f"https://github.com/{REPO}/blob/{BRANCH}/automations/{f.name}",
        "raw": f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/automations/{f.name}"})
(HERE / "automations.json").write_text(json.dumps({"repo": f"https://github.com/{REPO}", "items": items}, indent=1, ensure_ascii=False) + "\n")
print(len(items), "automations")
