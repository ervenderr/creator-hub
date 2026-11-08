#!/usr/bin/env python3
"""Build content.json from ~/.claude/skills, publishing ONLY names listed in publish.txt.
publish.txt line format:  name            -> publish full SKILL.md body (skills you wrote)
                          name | https://.. -> publish description + link only (third-party)
Also writes candidates.txt (every skill + description) to help you pick."""
import json, re, sys
from pathlib import Path

SKILLS = Path.home() / ".claude" / "skills"
HERE = Path(__file__).parent
SECRET = re.compile(r"(api[_-]?key|secret|token|password|sk-[A-Za-z0-9]{10,})\s*[:=]", re.I)

def parse(path):
    # utf-8-sig drops a BOM; normalise CRLF so the frontmatter regex matches
    text = path.read_text(encoding="utf-8-sig", errors="replace").replace("\r\n", "\n")
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        return None
    meta, key = {}, None
    for line in m.group(1).splitlines():
        # continuation of a block scalar; also accept unindented lines (malformed frontmatter) except "**Label:**" metadata
        unindented_text = key and not meta[key] and not re.match(r"^[\w-]+:(\s|$)", line) and not line.startswith("**")
        if key and ((line[:1] in " \t") or unindented_text):
            meta[key] = (meta[key] + " " + line.strip()).strip()
            continue
        if line.startswith("**"):
            continue
        k, _, v = line.partition(":")
        key, v = k.strip(), v.strip()
        meta[key] = "" if v in (">", "|", ">-", "|-") else v.strip("\"'")
    return meta, m.group(2).strip()

def load_all():
    out = {}
    for d in sorted(SKILLS.iterdir()):
        f = d / "SKILL.md"
        if d.is_dir() and f.exists():
            p = parse(f)
            if p:
                out[d.name] = p
    return out

def read_publish():
    f = HERE / "publish.txt"
    items = []
    for raw in f.read_text().splitlines() if f.exists() else []:
        raw = raw.split("#", 1)[0].strip()
        if raw:
            name, _, rest = raw.partition("|")
            url, _, desc = rest.partition("|")  # `name | url | description` works for skills not installed locally
            items.append((name.strip(), url.strip(), desc.strip()))
    return items

def main():
    skills = load_all()
    (HERE / "candidates.txt").write_text(
        "\n".join(f"{n} — {m.get('description','')[:110]}" for n, (m, _) in skills.items()) + "\n")
    agents = []
    for name, url, desc in read_publish():
        if name not in skills:
            if url and desc:
                agents.append({"name": "/" + name, "desc": desc[:200], "setup": "", "source": url})
                continue
            sys.exit(f"publish.txt: unknown skill '{name}' (add `name | url | description` for link-only)")
        meta, body = skills[name]
        if not url and SECRET.search(body):
            sys.exit(f"'{name}' body looks like it contains a secret; remove it or publish as link-only")
        agents.append({"name": "/" + name, "desc": meta.get("description", "")[:200],
                       "setup": body if not url else "", "source": url})
    (HERE / "content.json").write_text(json.dumps({"agents": agents}, indent=2) + "\n")
    print(f"{len(skills)} candidates -> candidates.txt; {len(agents)} published -> content.json")

if __name__ == "__main__":
    main()
