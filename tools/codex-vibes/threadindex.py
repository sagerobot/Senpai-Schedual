"""The shared thread index: which shows have r/anime episode threads, and where.

thread-index.json lives on the `data` branch next to vibes.json and inverts the
discovery problem: instead of asking reddit "does episode N have a thread?" once
per episode (and re-asking forever for shows that never get threads), the index
remembers per SHOW whether threads exist at all, plus every episode->URL pairing
we have ever confirmed. Sweeps consult it to skip unthreaded shows and to read
known URLs directly; they fold every confirmed find back in for free.

Shape:
  {"version": 1, "shows": {"<showId>": {
      "title": "romaji",            # for probe prompts and humans
      "threaded": true|false,
      "checkedAt": "ISO",           # set ONLY by a per-show probe
      "threads": {"<episode>": {"url": "...", "title": "..."}}}}}

Authority rules, in order of how much they matter:
- Only a per-show probe (index_task.py) may set threaded=false or checkedAt.
  Sweeps only ever ADD: a confirmed find flips threaded to true and records the
  URL, but a sweep miss proves nothing about the show.
- threaded=false expires after RECHECK_DAYS: a show can gain threads later
  (late licensing, sudden popularity), so unthreaded is a lease, not a verdict.
- Nothing is ever deleted. A wrong URL is overwritten by the next confirm.
"""

import json
import re
import shutil
import subprocess
from datetime import datetime, timezone

GIT = shutil.which("git") or r"C:\Program Files\Git\cmd\git.exe"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

INDEX_FILE = "thread-index.json"
RECHECK_DAYS = 7

PROBE_PROMPT = (
    "Use web search. TASK: catalog the r/anime episode discussion threads for EXACTLY this anime. "
    "TARGET SHOW (AniList romaji title): {title}. "
    "r/anime's bot u/AutoLovepon titles these threads '<Show Title> - Episode N discussion', and each thread's body links the previous episodes' threads, so one found thread lets you enumerate the whole chain. "
    "HARD RULES: every thread must be for THIS show; season markers (Season 2, Part 2, 2nd Season) must agree between the show title and thread titles; never substitute a different season or a similarly-titled show. "
    "If this show has no r/anime episode discussion threads at all, report threaded=false - many shorts, kids shows, and donghua are never threaded, and false is a correct, useful answer. "
    "Use at most 6 web searches then conclude. "
    "FINAL MESSAGE FORMAT: first line exactly 'TARGET: {title}', then ONLY a raw JSON object, no markdown fences, shaped: "
    '{{"threaded": true, "confidence": "high", "threads": [{{"episode": 1, "url": "https://www.reddit.com/r/anime/comments/...", "title": "..."}}], "notes": "..."}}. '
    'Episode numbers are integers; include every episode thread you can enumerate. Set confidence "low" if unsure the match is this exact show; when threaded=false include only threaded, confidence, notes.'
)


def _run(cmd, cwd, timeout=120):
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout,
                          creationflags=NO_WINDOW)


def empty_index():
    return {"version": 1, "shows": {}}


def load_index(repo):
    """The index as origin/data has it. Fetch first; absence is a fresh start."""
    show = _run([GIT, "show", f"origin/data:{INDEX_FILE}"], cwd=repo)
    if show.returncode != 0:
        return empty_index()
    try:
        idx = json.loads(show.stdout)
    except json.JSONDecodeError:
        return empty_index()
    if not isinstance(idx.get("shows"), dict):
        return empty_index()
    return idx


def show_entry(index, show_id):
    return index["shows"].get(str(show_id))


def is_skippable(index, show_id, now=None):
    """True when a fresh probe said this show has no threads. Sweeps skip these."""
    e = show_entry(index, show_id)
    if e is None or e.get("threaded") is not False:
        return False
    checked = e.get("checkedAt")
    try:
        age_days = ((now or datetime.now(timezone.utc)) -
                    datetime.fromisoformat(checked.replace("Z", "+00:00"))).days
    except (AttributeError, ValueError):
        return False  # unparseable lease -> treat as expired, probe again
    return age_days < RECHECK_DAYS


def known_url(index, show_id, episode):
    e = show_entry(index, show_id)
    if e is None:
        return None
    t = (e.get("threads") or {}).get(str(episode))
    return t.get("url") if t else None


def note_found(index, show_id, episode, url, thread_title="", title=None):
    """Fold one confirmed (show, episode) -> URL into the index. Returns changed."""
    if "/comments/" not in (url or ""):
        return False
    shows = index["shows"]
    e = shows.setdefault(str(show_id), {"threaded": True, "threads": {}})
    e["threaded"] = True
    e.setdefault("threads", {})
    if title and not e.get("title"):
        e["title"] = title
    prior = e["threads"].get(str(episode))
    if prior and prior.get("url") == url:
        return False
    e["threads"][str(episode)] = {"url": url, "title": (thread_title or "")[:200]}
    return True


def apply_probe(index, show_id, title, result, now=None):
    """Record a per-show probe verdict. Only this path writes threaded=false."""
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    e = index["shows"].setdefault(str(show_id), {"threads": {}})
    e["title"] = title
    e["checkedAt"] = stamp
    if not result.get("threaded"):
        # A confirmed URL outlives an unthreaded verdict — never discard threads.
        e["threaded"] = bool(e.get("threads"))
        return
    e["threaded"] = True
    e.setdefault("threads", {})
    for t in result.get("threads", []):
        ep, url = t.get("episode"), t.get("url") or ""
        if isinstance(ep, int) and "/comments/" in url:
            e["threads"][str(ep)] = {"url": url, "title": (t.get("title") or "")[:200]}


def parse_probe_output(raw):
    """worker.py's transcript conventions: strip ANSI, take the final message."""
    text = re.sub(r"\x1b\[[0-9;]*m", "", raw).split("--- STDERR ---")[0]
    final = re.split(r"^codex$", text, flags=re.M)[-1].split("tokens used")[0]
    m = re.search(r'\{"threaded".*\}', final, re.S)
    if not m:
        return None
    try:
        r = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    if r.get("confidence") != "high":
        return None
    return r


def dump_index(index):
    return json.dumps(index, indent=1, sort_keys=True) + "\n"
