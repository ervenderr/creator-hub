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
    types = [n["type"] for n in wf["nodes"]]
    tags = [t for t, hit in [("AI agent", any(x.endswith(".agent") for x in types)), ("Loop", any(x.endswith("splitInBatches") for x in types)),
        ("Parallel", any(x.endswith(".merge") for x in types)), ("Router", any(x.endswith(".switch") for x in types)),
        ("Approval", any("sendAndWait" in json.dumps(n["parameters"]) for n in wf["nodes"])), ("Branch", any(x.endswith(".if") for x in types))] if hit]
    items.append({"id": f.stem, "name": wf["name"], "category": m["category"], "desc": m["description"],
        "guardrails": m["guardrails"], "steps": [n["name"] for n in wf["nodes"] if n["name"] != "Read me"],
        "image": f"automations/shots/{f.stem}.jpg", "tags": tags,
        "source": f"https://github.com/{REPO}/blob/{BRANCH}/automations/{f.name}",
        "raw": f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/automations/{f.name}"})
(HERE / "automations.json").write_text(json.dumps({"repo": f"https://github.com/{REPO}", "items": items}, indent=1, ensure_ascii=False) + "\n")
print(len(items), "automations")
