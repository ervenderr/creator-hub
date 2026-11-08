#!/usr/bin/env python3
"""Build videos.json (newest first) from youtube-os uploads; titles come from YouTube oEmbed, so a video that is private or deleted is skipped."""
import json, urllib.request, urllib.error
from datetime import datetime
from pathlib import Path

SRC = Path.home() / "Projects" / "youtube-os" / "publish" / "uploaded.json"
OUT = Path(__file__).parent / "videos.json"

def title(vid):
    u = f"https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v={vid}"
    try:
        with urllib.request.urlopen(u, timeout=15) as r:
            return json.load(r)["title"]
    except (urllib.error.URLError, KeyError, ValueError):
        return None

def main():
    rows = sorted(json.loads(SRC.read_text()).values(), key=lambda v: datetime.fromisoformat(v["publish_at"]), reverse=True)
    out = []
    for v in rows:
        t = title(v["video_id"])
        if t:
            out.append({"id": v["video_id"], "title": t})
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(out)}/{len(rows)} public videos -> videos.json")

if __name__ == "__main__":
    main()
