"""One-shot season-coverage sweep: run a prepared work list through Codex.

Same shape as fresh_task.py but fed by season_gap.ts instead of vibes:prepare,
and delivered in numbered chunks (packet-summer26-NNN) so a crash mid-run loses
at most one chunk. 'summer26' sorts after 'fresh' (release-day readings still
jump the queue) but before the older-season backlog, so current-season coverage
lands first.

Usage: python season_task.py <work.json> <packet-prefix>
e.g.   python season_task.py season-work.json summer26
"""

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from threadindex import INDEX_FILE, dump_index, is_skippable, known_url, load_index, note_found

REPO = Path(__file__).resolve().parents[2]
WORKDIR = Path(os.environ.get("LOCALAPPDATA", str(REPO / ".local"))) / "senpai-vibes"

GIT = shutil.which("git") or r"C:\Program Files\Git\cmd\git.exe"
ANSI = re.compile(r"\x1b\[[0-9;]*m")
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
CHUNK = 40

LOG = WORKDIR / "season.log"


def log(msg: str) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    WORKDIR.mkdir(parents=True, exist_ok=True)
    line = f"[{stamp}] {msg}"
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", "replace").decode(), flush=True)


def run(cmd, cwd=REPO, timeout=300):
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout,
                          creationflags=NO_WINDOW)


def gate(work_items, out_dir: Path):
    """fresh_task.py's HI-confidence gate, verbatim in spirit."""
    items = []
    for w in work_items:
        f = out_dir / f"{w['showId']}-{w['episode']}.txt"
        if not f.exists():
            continue
        text = ANSI.sub("", f.read_text(encoding="utf-8", errors="replace")).split("--- STDERR ---")[0]
        final = re.split(r"^codex$", text, flags=re.M)[-1].split("tokens used")[0]
        m = re.search(r'\{"found".*\}', final, re.S)
        if not m:
            continue
        try:
            r = json.loads(m.group(0))
        except json.JSONDecodeError:
            continue
        if not r.get("found") or r.get("confidence") != "high":
            continue
        th = r.get("thread") or {}
        url = th.get("url") or ""
        if "/comments/" not in url:
            continue
        item = {
            "key": w["key"], "showId": w["showId"], "episode": w["episode"],
            "title": w["title"], "airedAt": w.get("airedAt", 0), "kind": w.get("kind", "settle"),
            "thread": {"title": th.get("title", ""), "url": url,
                       "score": th.get("score") or 0, "num_comments": th.get("num_comments") or 0},
        }
        if (r.get("comments_read") or 0) >= 5 and r.get("opinions"):
            item.update({
                "comments_read": r.get("comments_read"), "opinions": r.get("opinions", []),
                "aspects": r.get("aspects") or {}, "notes": (r.get("notes") or "")[:300],
            })
        else:
            # Verified thread, near-empty: keep it as a `quiet` entry rather
            # than dropping the fact that the thread exists.
            item["status"] = "quiet"
        items.append(item)
    return items


def next_packet_number(prefix: str) -> int:
    ls = run([GIT, "ls-tree", "origin/data", "backfill/", "--name-only"])
    highest = 0
    for line in ls.stdout.splitlines():
        m = re.match(rf"backfill/packet-{re.escape(prefix)}-(\d+)\.json$", line.strip())
        if m:
            highest = max(highest, int(m.group(1)))
    return highest + 1


def deliver(items, prefix: str) -> bool:
    if run([GIT, "fetch", "origin", "data"]).returncode != 0:
        log("fetch failed before delivery")
        return False
    # Merge this chunk's confirmed threads onto the LATEST index — loading it
    # fresh here (not at sweep start) is what makes concurrent writers safe.
    index = load_index(REPO)
    index_changed = False
    for it in items:
        index_changed = note_found(index, it["showId"], it["episode"], it["thread"]["url"],
                                   it["thread"]["title"], title=it["title"]) or index_changed
    packet_name = f"packet-{prefix}-{next_packet_number(prefix):03d}.json"
    wt = WORKDIR / "season-wt"
    run([GIT, "worktree", "remove", "--force", str(wt)])
    if run([GIT, "worktree", "add", "--detach", str(wt), "origin/data"]).returncode != 0:
        log("worktree add failed")
        return False
    try:
        (wt / "backfill").mkdir(exist_ok=True)
        (wt / "backfill" / packet_name).write_text(json.dumps(items, indent=1), encoding="utf-8")
        run([GIT, "add", "backfill"], cwd=wt)
        if index_changed:
            (wt / INDEX_FILE).write_text(dump_index(index), encoding="utf-8")
            run([GIT, "add", INDEX_FILE], cwd=wt)
        run([GIT, "-c", "user.name=senpai-season-task", "-c", "user.email=season-task@local",
             "commit", "-m", f"data: season sweep packet {packet_name[7:-5]} ({len(items)} readings)"], cwd=wt)
        if run([GIT, "push", "origin", "HEAD:data"], cwd=wt).returncode != 0:
            run([GIT, "pull", "--rebase", "origin", "data"], cwd=wt)
            if run([GIT, "push", "origin", "HEAD:data"], cwd=wt).returncode != 0:
                log(f"push failed twice; {packet_name} not delivered")
                return False
        log(f"delivered {packet_name}: {len(items)} readings")
        return True
    finally:
        run([GIT, "worktree", "remove", "--force", str(wt)])


def main() -> int:
    work_file = Path(sys.argv[1])
    prefix = sys.argv[2] if len(sys.argv) > 2 else "summer26"
    work = json.loads(work_file.read_text(encoding="utf-8"))

    # Consult the thread index: drop episodes of probed-unthreaded shows, and
    # carry known URLs so the worker reads instead of searching.
    run([GIT, "fetch", "origin", "data"])
    index = load_index(REPO)
    kept = []
    skipped = 0
    for w in work:
        if is_skippable(index, w["showId"]):
            skipped += 1
            continue
        url = known_url(index, w["showId"], w["episode"])
        if url:
            w["thread_url"] = url
        kept.append(w)
    if skipped:
        log(f"{skipped} episode(s) dropped - unthreaded show per index")
    work = kept

    # Per-run output dir: worker.py skips items whose transcript already
    # exists, so a shared dir would turn every retry into a silent no-op (a
    # not-found transcript from a previous run "resumes" as not-found forever).
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    out_dir = WORKDIR / f"season-out-{prefix}-{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    log(f"season sweep start: {len(work)} items, chunks of {CHUNK}, run {stamp}")

    delivered = gated_total = 0
    for start in range(0, len(work), CHUNK):
        chunk = work[start:start + CHUNK]
        chunk_file = out_dir / f"chunk-{start}.json"
        chunk_file.write_text(json.dumps(chunk), encoding="utf-8")
        worker = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("worker.py")),
             str(chunk_file), str(out_dir), str(LOG)],
            cwd=str(WORKDIR), timeout=3 * 3600, creationflags=NO_WINDOW,
        )
        if worker.returncode != 0:
            log(f"worker aborted on chunk {start}; gating what it collected")
        items = gate(chunk, out_dir)
        gated_total += len(items)
        if items:
            if deliver(items, prefix):
                delivered += len(items)
        else:
            log(f"chunk {start}: nothing passed the gate")

    log(f"season sweep done: {gated_total} passed gate, {delivered} delivered, "
        f"{len(work) - gated_total} skipped (no confident thread)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
