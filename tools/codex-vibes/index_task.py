"""Build or refresh thread-index.json on the data branch.

Two phases, cheapest first:

1. BOOTSTRAP (free): every found reading in vibes.json and every queued backfill
   packet already carries its thread URL — each one is proof its show is
   threaded. Folding them in gives most of the index without a single probe.
2. PROBE (one Codex call per show): only roster shows with no evidence at all
   get a per-show probe, which either enumerates the thread chain or records an
   authoritative threaded=false with a RECHECK_DAYS lease. Stale unthreaded
   leases are re-probed too.

Usage: python index_task.py [--bootstrap-only]
"""

import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from threadindex import (
    INDEX_FILE, PROBE_PROMPT, apply_probe, dump_index, is_skippable,
    load_index, note_found, parse_probe_output, show_entry,
)

REPO = Path(__file__).resolve().parents[2]
WORKDIR = Path(os.environ.get("LOCALAPPDATA", str(REPO / ".local"))) / "senpai-vibes"
LOG = WORKDIR / "index.log"

GIT = shutil.which("git") or r"C:\Program Files\Git\cmd\git.exe"
NPX = shutil.which("npx") or r"C:\Program Files\nodejs\npx.cmd"
CODEX = shutil.which("codex") or r"C:\Users\sager\AppData\Roaming\npm\codex.cmd"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


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


def run(cmd, cwd=REPO, timeout=300, stdin_text=None):
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout,
                          input=stdin_text, creationflags=NO_WINDOW)


def probe(title: str) -> dict | None:
    prompt = PROBE_PROMPT.format(title=title.replace('"', "'"))
    assert "\n" not in prompt
    proc = subprocess.Popen(
        [CODEX, "exec", "-m", "gpt-5.6-luna", "-c", "tools.web_search=true",
         "-c", "model_reasoning_effort=low", "--skip-git-repo-check", prompt],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace", cwd=str(WORKDIR),
        creationflags=NO_WINDOW,
    )
    try:
        out, _err = proc.communicate(timeout=300)
    except subprocess.TimeoutExpired:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       capture_output=True, creationflags=NO_WINDOW)
        return None
    if "TARGET:" not in (out or ""):
        return None
    return parse_probe_output(out)


def main() -> int:
    bootstrap_only = "--bootstrap-only" in sys.argv
    if run([GIT, "fetch", "origin", "data"]).returncode != 0:
        log("git fetch failed - offline?")
        return 1

    index = load_index(REPO)
    before = json.dumps(index, sort_keys=True)

    season = run([GIT, "show", "origin/data:season.json"]).stdout
    roster = json.loads(run([NPX, "tsx", "tools/codex-vibes/western_roster.ts"],
                            stdin_text=season, timeout=120).stdout)
    titles = {r["id"]: r["title"] for r in roster}
    log(f"roster: {len(roster)} Western-watchable shows")

    # --- Phase 1: bootstrap from every reading we already trust.
    added = 0
    vibes = json.loads(run([GIT, "show", "origin/data:vibes.json"]).stdout or '{"entries":{}}')
    for key, e in vibes.get("entries", {}).items():
        sid, _, ep = key.partition(":")
        if e.get("status") == "found":
            added += note_found(index, sid, ep, e.get("url", ""), title=titles.get(int(sid)))
    packets = run([GIT, "ls-tree", "origin/data", "backfill/", "--name-only"]).stdout.split()
    for p in packets:
        try:
            items = json.loads(run([GIT, "show", f"origin/data:{p}"]).stdout)
        except json.JSONDecodeError:
            continue
        for i in items:
            th = i.get("thread") or {}
            added += note_found(index, i["showId"], i["episode"], th.get("url", ""),
                                th.get("title", ""), title=i.get("title"))
    log(f"bootstrap: {added} thread URLs folded in, {len(index['shows'])} shows known")

    # --- Phase 2: probe roster shows with no evidence (or an expired lease).
    need = [r for r in roster
            if (show_entry(index, r["id"]) is None
                or (show_entry(index, r["id"]).get("threaded") is False
                    and not is_skippable(index, r["id"])))]
    if bootstrap_only:
        log(f"bootstrap-only: skipping {len(need)} probes ({', '.join(str(r['id']) for r in need)})")
    else:
        log(f"probing {len(need)} shows with no thread evidence")
        for n, r in enumerate(need, 1):
            log(f"({n}/{len(need)}) probe {r['id']}: {r['title'][:60]}")
            result = probe(r["title"])
            if result is None:
                log("  no confident verdict; leaving unknown")
                continue
            apply_probe(index, r["id"], r["title"], result)
            e = show_entry(index, r["id"])
            log(f"  threaded={e['threaded']} ({len(e.get('threads') or {})} threads)")
            time.sleep(5)

    if json.dumps(index, sort_keys=True) == before:
        log("index unchanged; nothing to commit")
        return 0

    # --- Deliver on the data branch, same worktree pattern as the sweeps.
    wt = WORKDIR / "index-wt"
    run([GIT, "worktree", "remove", "--force", str(wt)])
    if run([GIT, "worktree", "add", "--detach", str(wt), "origin/data"]).returncode != 0:
        log("worktree add failed")
        return 1
    try:
        (wt / INDEX_FILE).write_text(dump_index(index), encoding="utf-8")
        run([GIT, "add", INDEX_FILE], cwd=wt)
        threaded = sum(1 for e in index["shows"].values() if e.get("threaded"))
        run([GIT, "-c", "user.name=senpai-index-task", "-c", "user.email=index-task@local",
             "commit", "-m",
             f"data: thread index ({len(index['shows'])} shows, {threaded} threaded)"], cwd=wt)
        if run([GIT, "push", "origin", "HEAD:data"], cwd=wt).returncode != 0:
            run([GIT, "pull", "--rebase", "origin", "data"], cwd=wt)
            if run([GIT, "push", "origin", "HEAD:data"], cwd=wt).returncode != 0:
                log("push failed twice; index not delivered")
                return 1
        log(f"delivered {INDEX_FILE}: {len(index['shows'])} shows, {threaded} threaded")
    finally:
        run([GIT, "worktree", "remove", "--force", str(wt)])
    return 0


if __name__ == "__main__":
    sys.exit(main())
