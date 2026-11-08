#!/usr/bin/env python3
"""Build office.json (rooms + agents) from the agents/*.md files in this repo.
Usage: build_office.py
Each agent's source and setup point at this repo, so agents/ stays the single source of truth."""
import json, re
from pathlib import Path

HERE = Path(__file__).parent
REPO, BRANCH = "ervenderr/creator-hub", "main"
# room id -> (label, color). Rooms with no agents are dropped.
ROOMS = {
    "engineering": ("Engineering", "#3B82F6"),
    "specialists": ("Specialists", "#6366F1"),
    "marketing": ("Marketing", "#F97316"),
    "security": ("Security", "#EF4444"),
    "design": ("Design and Product", "#EC4899"),
    "qa": ("QA", "#F59E0B"),
    "pm": ("Project Management", "#0EA5E9"),
    "ops": ("Support and Ops", "#84CC16"),
}

def parse(path):
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise SystemExit(f"{path.name}: missing frontmatter")
    meta = {}
    for line in m.group(1).splitlines():
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip().strip("\"")
    for key in ("name", "description", "room", "vibe"):
        if not meta.get(key):
            raise SystemExit(f"{path.name}: missing {key}")
    if meta["room"] not in ROOMS:
        raise SystemExit(f"{path.name}: unknown room {meta['room']}")
    return meta

def main():
    agents = []
    for f in sorted((HERE / "agents").glob("*.md")):
        meta = parse(f)
        raw = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/agents/{f.name}"
        agents.append({
            "id": f.stem, "room": meta["room"], "name": meta["name"],
            "role": meta["vibe"], "desc": meta["description"],
            "emoji": meta.get("emoji", ""), "color": meta.get("color", ""),
            "source": f"https://github.com/{REPO}/blob/{BRANCH}/agents/{f.name}",
            "setup": f"Fetch {raw} and save it as ~/.claude/agents/{f.name}, then use the \"{meta['name']}\" agent for this task: <describe your task>.",
        })
    counts = {rid: sum(a["room"] == rid for a in agents) for rid in ROOMS}
    rooms = [{"id": rid, "label": label, "color": color, "count": counts[rid]}
             for rid, (label, color) in ROOMS.items() if counts[rid]]
    ids = [a["id"] for a in agents]
    assert len(ids) == len(set(ids)), "duplicate agent ids"
    out = {"source": f"https://github.com/{REPO}", "rooms": rooms, "agents": agents}
    (HERE / "office.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(agents)} agents in {len(rooms)} rooms")

if __name__ == "__main__":
    main()
