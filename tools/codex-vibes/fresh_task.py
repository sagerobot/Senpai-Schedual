"""The fresh-episode sweep (interim pipeline until reddit API approval).

Scheduled every 2 hours on the owner's PC. The division of labor mirrors the
production design in docs/vibes-refresh.md: this machine does the looking
(AniList via vibes:prepare, reddit via Codex's licensed web search), the cloud
Backfill writer routine does the writing, and the `data` branch is the mailbox.

  vibes:prepare (last 48h, kinds first/update/settle)
      -> worker.py (Codex, one transcript per episode)
      -> HI-confidence gate (found, high, >=5 comments, real /comments/ URL)
      -> backfill/packet-fresh-<stamp>.json on the data branch
      -> consumed by the hourly Backfill writer routine ('fresh' sorts first,
         so release-day readings jump the season-backfill queue)

Every gate errs toward writing nothing: a skipped episode costs one cycle,
and never a frozen wrong entry. not_found is NEVER emitted from here.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORKDIR = Path(os.environ.get("LOCALAPPDATA", str(REPO / ".local"))) / "senpai-vibes"
LOG = WORKDIR / "fresh.log"

NPM = shutil.which("npm") or r"C:\Program Files\nodejs\npm.cmd"
GIT = shutil.which("git") or r"C:\Program Files\Git\cmd\git.exe"

ANSI = re.compile(r"\x1b\[[0-9;]*m")


def log(msg: str) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    WORKDIR.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(f"[{stamp}] {msg}\n")


def run(cmd, cwd=REPO, timeout=300):
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout)


def main() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    run_dir = WORKDIR / f"run-{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)

    # 1. Current vibes file, fresh from the branch.
    if run([GIT, "fetch", "origin", "data"]).returncode != 0:
        log("git fetch failed - offline? skipping this cycle")
        return 0
    vibes_path = run_dir / "vibes.json"
    show = run([GIT, "show", "origin/data:vibes.json"])
    vibes_path.write_text(show.stdout if show.returncode == 0 else '{"version":1,"entries":{}}', encoding="utf-8")

    # 2. What aired in the last 48h and needs a read (kinds first/update/settle).
    work_path = run_dir / "work.json"
    prep = run([NPM, "run", "vibes:prepare", "--", "--vibes", str(vibes_path), "--out", str(work_path)])
    if prep.returncode != 0 or not work_path.exists():
        log(f"vibes:prepare failed (AniList down?): {prep.stderr[-200:]}")
        return 0
    work = json.loads(work_path.read_text(encoding="utf-8"))
    if not work:
        log("no episodes due - clean no-op")
        return 0
    log(f"{len(work)} episodes due")

    # 3. Codex collection (per-run output dir so refreshed episodes re-read).
    out_dir = run_dir / "out"
    worker = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("worker.py")), str(work_path), str(out_dir), str(LOG)],
        cwd=str(WORKDIR), timeout=3 * 3600,
    )
    if worker.returncode != 0:
        log("worker aborted; keeping whatever it collected")

    # 4. Gate + packetize. Absence always beats a doubtful entry.
    items = []
    for w in work:
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
        if not r.get("found") or r.get("confidence") != "high" or (r.get("comments_read") or 0) < 5:
            continue
        th = r.get("thread") or {}
        url = th.get("url") or ""
        if "/comments/" not in url:
            continue
        items.append({
            "key": w["key"], "showId": w["showId"], "episode": w["episode"],
            "title": w["title"], "airedAt": w.get("airedAt", 0), "kind": w.get("kind", "first"),
            "thread": {"title": th.get("title", ""), "url": url,
                       "score": th.get("score") or 0, "num_comments": th.get("num_comments") or 0},
            "comments_read": r.get("comments_read"), "opinions": r.get("opinions", []),
            "aspects": r.get("aspects") or {}, "notes": (r.get("notes") or "")[:300],
        })
    if not items:
        log("nothing passed the gate this cycle")
        return 0

    # 5. Hand the packet to the cloud writer via the data branch.
    packet_name = f"packet-fresh-{stamp}.json"
    wt = WORKDIR / "data-wt"
    run([GIT, "worktree", "remove", "--force", str(wt)])
    if run([GIT, "worktree", "add", "--detach", str(wt), "origin/data"]).returncode != 0:
        log("worktree add failed"); return 1
    try:
        (wt / "backfill").mkdir(exist_ok=True)
        (wt / "backfill" / packet_name).write_text(json.dumps(items, indent=1), encoding="utf-8")
        run([GIT, "add", "backfill"], cwd=wt)
        run([GIT, "-c", "user.name=senpai-fresh-task", "-c", "user.email=fresh-task@local",
             "commit", "-m", f"data: fresh vibe packet {stamp} ({len(items)} readings)"], cwd=wt)
        if run([GIT, "push", "origin", "HEAD:data"], cwd=wt).returncode != 0:
            run([GIT, "pull", "--rebase", "origin", "data"], cwd=wt)
            if run([GIT, "push", "origin", "HEAD:data"], cwd=wt).returncode != 0:
                log("push failed twice; packet not delivered this cycle")
                return 1
        log(f"delivered {packet_name}: {len(items)} readings")
    finally:
        run([GIT, "worktree", "remove", "--force", str(wt)])
    return 0


if __name__ == "__main__":
    sys.exit(main())
