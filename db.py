"""SQLite storage for the scene-rating game.

Everything lives in one small database file. Streamlit Community Cloud runs the
app as a single process, so a plain SQLite file plus WAL mode is enough for a
room full of phones voting at once.

Set VOTE_DATA_DIR to move the database somewhere persistent.
"""

import os
import sqlite3
import statistics
import time
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(os.environ.get("VOTE_DATA_DIR", Path(__file__).parent / "data"))
DB_PATH = DATA_DIR / "votes.db"

N_TEAMS = 12
PHASES = ("waiting", "open", "reveal")

DEFAULT_STATE = {
    "phase": "waiting",       # waiting | open | reveal
    "active_team": "1",       # team id currently on stage
    "public_url": "",         # used to build the QR code on the projection
    "event_title": "Scene Battle",
}


def _connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=8000")
    con.execute("PRAGMA synchronous=NORMAL")
    return con


@contextmanager
def conn():
    c = _connect()
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db():
    with conn() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS teams (
                   id    INTEGER PRIMARY KEY,
                   name  TEXT NOT NULL,
                   scene TEXT NOT NULL DEFAULT ''
               )"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS votes (
                   team_id INTEGER NOT NULL,
                   voter   TEXT    NOT NULL,
                   score   INTEGER NOT NULL,
                   ts      REAL    NOT NULL,
                   PRIMARY KEY (team_id, voter)
               )"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS state (
                   key   TEXT PRIMARY KEY,
                   value TEXT NOT NULL
               )"""
        )
        if c.execute("SELECT COUNT(*) FROM teams").fetchone()[0] == 0:
            c.executemany(
                "INSERT INTO teams (id, name, scene) VALUES (?, ?, '')",
                [(i, f"Team {i}") for i in range(1, N_TEAMS + 1)],
            )
        for k, v in DEFAULT_STATE.items():
            c.execute("INSERT OR IGNORE INTO state (key, value) VALUES (?, ?)", (k, v))


# ---------------------------------------------------------------- state

def get_state():
    with conn() as c:
        rows = c.execute("SELECT key, value FROM state").fetchall()
    s = dict(DEFAULT_STATE)
    s.update({r["key"]: r["value"] for r in rows})
    return s


def set_state(**kwargs):
    with conn() as c:
        for k, v in kwargs.items():
            c.execute(
                "INSERT INTO state (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (k, str(v)),
            )


# ---------------------------------------------------------------- teams

def list_teams():
    with conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM teams ORDER BY id").fetchall()]


def get_team(team_id):
    with conn() as c:
        r = c.execute("SELECT * FROM teams WHERE id = ?", (int(team_id),)).fetchone()
    return dict(r) if r else None


def update_team(team_id, name, scene):
    with conn() as c:
        c.execute(
            "UPDATE teams SET name = ?, scene = ? WHERE id = ?",
            (name.strip() or f"Team {team_id}", scene.strip(), int(team_id)),
        )


# ---------------------------------------------------------------- votes

def cast_vote(team_id, voter, score):
    """Insert or replace one voter's score for one team. Returns nothing."""
    score = max(1, min(100, int(score)))
    with conn() as c:
        c.execute(
            "INSERT INTO votes (team_id, voter, score, ts) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(team_id, voter) DO UPDATE SET score=excluded.score, ts=excluded.ts",
            (int(team_id), voter, score, time.time()),
        )


def my_vote(team_id, voter):
    with conn() as c:
        r = c.execute(
            "SELECT score FROM votes WHERE team_id = ? AND voter = ?",
            (int(team_id), voter),
        ).fetchone()
    return r["score"] if r else None


def scores_for(team_id):
    with conn() as c:
        return [
            r["score"]
            for r in c.execute(
                "SELECT score FROM votes WHERE team_id = ? ORDER BY ts", (int(team_id),)
            ).fetchall()
        ]


def vote_count(team_id):
    with conn() as c:
        return c.execute(
            "SELECT COUNT(*) FROM votes WHERE team_id = ?", (int(team_id),)
        ).fetchone()[0]


def all_votes():
    with conn() as c:
        return [
            dict(r)
            for r in c.execute(
                "SELECT v.team_id, t.name AS team_name, v.voter, v.score, v.ts "
                "FROM votes v JOIN teams t ON t.id = v.team_id "
                "ORDER BY v.team_id, v.ts"
            ).fetchall()
        ]


def clear_team_votes(team_id):
    with conn() as c:
        c.execute("DELETE FROM votes WHERE team_id = ?", (int(team_id),))


def clear_all_votes():
    with conn() as c:
        c.execute("DELETE FROM votes")


# ---------------------------------------------------------------- scoring

def trimmed_mean(values, trim=0.10):
    """Mean after dropping the top and bottom `trim` fraction.

    Kills the "my friend's team gets 100, everyone else gets 1" problem.
    Falls back to the plain mean when there are too few votes to trim.
    """
    vals = sorted(values)
    n = len(vals)
    if n == 0:
        return None
    k = int(n * trim)
    if n - 2 * k < 3:
        return statistics.mean(vals)
    return statistics.mean(vals[k : n - k])


def team_stats(team_id):
    vals = scores_for(team_id)
    if not vals:
        return {"n": 0, "mean": None, "score": None, "median": None,
                "low": None, "high": None, "values": []}
    return {
        "n": len(vals),
        "mean": statistics.mean(vals),
        "score": trimmed_mean(vals),
        "median": statistics.median(vals),
        "low": min(vals),
        "high": max(vals),
        "values": vals,
    }


def leaderboard():
    rows = []
    for t in list_teams():
        s = team_stats(t["id"])
        if s["n"]:
            rows.append({**t, **s})
    rows.sort(key=lambda r: (r["score"], r["n"]), reverse=True)
    return rows
