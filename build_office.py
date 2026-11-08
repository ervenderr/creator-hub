#!/usr/bin/env python3
"""Build office.json (rooms + agents) from a checkout of msitarzewski/agency-agents (MIT).
Usage: build_office.py /path/to/agency-agents
Only metadata is published; each agent links to its source file, so the repo author stays the source of truth."""
import json, re, subprocess, sys
from pathlib import Path

REPO = "msitarzewski/agency-agents"
# room id -> (label, source folders). Folders not listed here are skipped on purpose.
ROOMS = {
    "engineering": ("Engineering", ["engineering"]),
    "specialists": ("Specialists", ["specialized"]),
    "marketing": ("Marketing", ["marketing", "paid-media"]),
    "security": ("Security", ["security"]),
    "geo": ("Geo and Spatial", ["gis", "spatial-computing"]),
    "design": ("Design and Product", ["design", "product"]),
    "sales": ("Sales", ["sales"]),
    "qa": ("QA", ["testing"]),
    "pm": ("Project Management", ["project-management"]),
    "ops": ("Support and Ops", ["support", "finance", "healthcare", "academic", "research", "game-development"]),
}
FALLBACK_COLOR = "#888888"

def parse(path):
    text = path.read_text(encoding="utf-8-sig", errors="replace").replace("\r\n", "\n")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None
    meta = {}
    for line in m.group(1).splitlines():
        k, sep, v = line.partition(":")
        if sep and re.fullmatch(r"[\w-]+", k.strip()):
            meta[k.strip()] = v.strip().strip("\"'")
    return meta if meta.get("name") else None

def main(root):
    root = Path(root)
    sha = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    divisions = json.loads((root / "divisions.json").read_text())["divisions"]
    rooms, agents = [], []
    for rid, (label, folders) in ROOMS.items():
        count = 0
        for folder in folders:
            for f in sorted((root / folder).glob("*.md")):
                meta = parse(f)
                if not meta:
                    continue  # READMEs and guides have no agent frontmatter
                rel = f"{folder}/{f.name}"
                raw = f"https://raw.githubusercontent.com/{REPO}/{sha}/{rel}"
                agents.append({
                    "id": f.stem, "room": rid, "name": meta["name"],
                    "role": meta.get("vibe", ""), "desc": meta.get("description", "")[:300],
                    "emoji": meta.get("emoji", ""), "color": meta.get("color", ""),
                    "source": f"https://github.com/{REPO}/blob/main/{rel}",
                    "setup": f"Fetch {raw} and save it as ~/.claude/agents/{f.name}, then use the \"{meta['name']}\" agent for this task: <describe your task>.",
                })
                count += 1
        color = divisions.get(folders[0], {}).get("color", FALLBACK_COLOR)
        rooms.append({"id": rid, "label": label, "color": color, "count": count})
    out = {"source": f"https://github.com/{REPO}", "license": "MIT", "commit": sha, "rooms": rooms, "agents": agents}
    ids = [a["id"] for a in agents]
    assert len(ids) == len(set(ids)), "duplicate agent ids"
    assert all(r["count"] > 0 for r in rooms), "empty room"
    Path(__file__).with_name("office.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(agents)} agents in {len(rooms)} rooms @ {sha[:7]}")
    for r in rooms:
        print(f"  {r['label']}: {r['count']}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
