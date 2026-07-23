"""Scene Battle — a Slido-style 1-100 rating app for a 12-team scene game.

Three views, all served by this one Streamlit app:

    ?view=vote            phones (default — this is what the QR code points at)
    ?view=board           the projector / big screen
    ?view=admin           the host's laptop (PIN protected)
"""

import io
import uuid

import pandas as pd
import segno
import streamlit as st

import db

REFRESH_BOARD = 2   # seconds between projection refreshes
REFRESH_PHONE = 4   # seconds between phone refreshes

st.set_page_config(page_title="Scene Battle", page_icon="🎭", layout="wide")
db.init_db()


# ------------------------------------------------------------------ helpers

def admin_pin():
    try:
        return str(st.secrets["admin_pin"])
    except Exception:
        return "1234"  # local dev fallback — always set a real PIN in secrets


def voter_id():
    """A per-device token kept in the URL so a page refresh keeps the same identity."""
    v = st.query_params.get("v")
    if not v:
        v = uuid.uuid4().hex[:12]
        st.query_params["v"] = v
    return v


def qr_data_uri(url, scale=9):
    return segno.make(url, error="m").png_data_uri(scale=scale, border=2)


def inject_css():
    st.markdown(
        """
        <style>
          #MainMenu, footer, header {visibility: hidden;}
          .block-container {padding-top: 2rem; padding-bottom: 2rem;}
          .huge   {font-size: 7rem;  font-weight: 800; line-height: 1; margin: 0;}
          .big    {font-size: 3.2rem; font-weight: 700; line-height: 1.1; margin: 0;}
          .mid    {font-size: 1.8rem; font-weight: 600; margin: 0;}
          .muted  {opacity: .65;}
          .pill   {display:inline-block; padding:.25rem .9rem; border-radius:999px;
                   background:#ff4b4b22; color:#ff4b4b; font-weight:700; letter-spacing:.05em;}
          .card   {padding:1.2rem 1.5rem; border-radius:16px; background:#ffffff0d;
                   border:1px solid #ffffff1a;}
          div.stButton > button {font-size:1.3rem; font-weight:700; padding:.8rem 1rem;}
        </style>
        """,
        unsafe_allow_html=True,
    )


def phase_label(phase):
    return {"waiting": "Waiting", "open": "Voting open", "reveal": "Results"}.get(phase, phase)


# ------------------------------------------------------------------ voter view

@st.fragment(run_every=REFRESH_PHONE)
def _phase_watcher(signature):
    """Polls the host's state and reruns the page only when something changed.

    Deliberately renders nothing. If the voting UI itself lived inside an
    auto-refreshing fragment, every tick would re-render the slider and throw
    away a rating the voter had adjusted but not yet submitted.
    """
    s = db.get_state()
    if f"{s['phase']}|{s['active_team']}" != signature:
        st.rerun(scope="app")


def render_vote():
    inject_css()
    me = voter_id()
    s = db.get_state()
    team = db.get_team(s["active_team"]) or {"id": 0, "name": "—", "scene": ""}
    phase = s["phase"]

    st.markdown(f"### 🎭 {s['event_title']}")

    if phase == "waiting":
        st.markdown(
            f"<div class='card'><p class='mid'>Next up: {team['name']}</p>"
            f"<p class='muted'>Voting is closed. Keep this page open — "
            f"the rating slider appears the moment the host opens it.</p></div>",
            unsafe_allow_html=True,
        )

    elif phase == "reveal":
        stats = db.team_stats(team["id"])
        mine = db.my_vote(team["id"], me)
        st.markdown(f"<p class='mid'>{team['name']}</p>", unsafe_allow_html=True)
        if stats["n"]:
            st.markdown(
                f"<p class='huge'>{stats['score']:.1f}</p>"
                f"<p class='muted'>final score · {stats['n']} votes</p>",
                unsafe_allow_html=True,
            )
        else:
            st.info("No votes were cast for this scene.")
        if mine is not None:
            st.caption(f"You gave it {mine}.")
        st.divider()
        board = db.leaderboard()[:5]
        if board:
            st.markdown("**Top 5 so far**")
            for i, r in enumerate(board, 1):
                st.write(f"{i}. **{r['name']}** — {r['score']:.1f}")

    else:  # open
        mine = db.my_vote(team["id"], me)
        st.markdown(f"<p class='big'>{team['name']}</p>", unsafe_allow_html=True)
        if team["scene"]:
            st.caption(team["scene"])
        st.markdown("<span class='pill'>VOTING OPEN</span>", unsafe_allow_html=True)
        st.write("")

        key = f"score_{team['id']}"
        if key not in st.session_state:
            st.session_state[key] = mine if mine is not None else 50

        st.slider("Your rating", 1, 100, key=key, label_visibility="collapsed")
        st.markdown(
            f"<p class='huge' style='text-align:center'>{st.session_state[key]}</p>",
            unsafe_allow_html=True,
        )

        label = "Update my vote" if mine is not None else "Submit my vote"
        if st.button(label, type="primary", width="stretch", key=f"btn_{team['id']}"):
            db.cast_vote(team["id"], me, st.session_state[key])
            st.toast(f"Recorded: {st.session_state[key]}/100", icon="✅")
            st.rerun()

        if mine is not None:
            st.success(f"Your vote for {team['name']}: **{mine}/100** — you can change it "
                       "until the host closes voting.")
        st.caption("One vote per device. Scores stay hidden until the reveal.")

    _phase_watcher(f"{phase}|{s['active_team']}")


# ------------------------------------------------------------------ projection view

@st.fragment(run_every=REFRESH_BOARD)
def _live_count(signature, team_id):
    """Ticks the vote counter while voting is open, and reruns on phase change.

    The counter is the only thing inside the fragment: a fragment whose element
    tree changes shape between runs can leave stale widgets on screen, which on
    a projector means the QR code stays up after the reveal.
    """
    s = db.get_state()
    if f"{s['phase']}|{s['active_team']}" != signature:
        st.rerun(scope="app")
    st.markdown(
        f"<p class='huge' style='text-align:center'>{db.vote_count(team_id)}</p>",
        unsafe_allow_html=True,
    )


@st.fragment(run_every=REFRESH_BOARD)
def _board_watcher(signature):
    s = db.get_state()
    if f"{s['phase']}|{s['active_team']}" != signature:
        st.rerun(scope="app")


def render_board():
    inject_css()
    s = db.get_state()
    team = db.get_team(s["active_team"]) or {"id": 0, "name": "—", "scene": ""}
    phase = s["phase"]
    url = s["public_url"].strip()
    signature = f"{phase}|{s['active_team']}"

    head, right = st.columns([3, 1])
    with head:
        st.markdown(
            f"<p class='mid muted'>{s['event_title']} · scene "
            f"{team['id']} of {db.N_TEAMS}</p>"
            f"<p class='big'>{team['name']}</p>",
            unsafe_allow_html=True,
        )
        if team["scene"]:
            st.markdown(f"<p class='mid muted'>{team['scene']}</p>", unsafe_allow_html=True)
    with right:
        if url and phase != "reveal":
            st.markdown(
                f"<div style='text-align:center'>"
                f"<img src='{qr_data_uri(url)}' style='width:100%;max-width:260px;"
                f"border-radius:12px'/>"
                f"<p class='muted' style='margin-top:.4rem'>Scan to vote<br>"
                f"<code>{url}</code></p></div>",
                unsafe_allow_html=True,
            )
        elif not url:
            st.warning("Set the public URL in the admin view to show the QR code.")

    st.divider()

    if phase == "waiting":
        st.markdown(
            "<p class='big' style='text-align:center'>Get ready…</p>"
            "<p class='mid muted' style='text-align:center'>Scan the QR code now — "
            "voting opens in a moment.</p>",
            unsafe_allow_html=True,
        )
        _board_watcher(signature)

    elif phase == "open":
        st.markdown(
            "<p style='text-align:center' class='mid'><span class='pill'>VOTING OPEN</span></p>",
            unsafe_allow_html=True,
        )
        _live_count(signature, team["id"])
        st.markdown(
            "<p class='mid muted' style='text-align:center'>votes in · scores hidden "
            "until the reveal</p>",
            unsafe_allow_html=True,
        )

    else:  # reveal
        stats = db.team_stats(team["id"])
        left, mid = st.columns([1, 1])
        with left:
            if stats["n"]:
                st.markdown(
                    f"<p class='muted mid'>{team['name']} scores</p>"
                    f"<p class='huge'>{stats['score']:.1f}</p>"
                    f"<p class='mid muted'>{stats['n']} votes · raw avg "
                    f"{stats['mean']:.1f} · range {stats['low']}–{stats['high']}</p>",
                    unsafe_allow_html=True,
                )
                bins = list(range(0, 101, 10))
                hist = pd.cut(pd.Series(stats["values"]), bins=bins).value_counts().sort_index()
                st.bar_chart(
                    pd.DataFrame({"votes": hist.values},
                                 index=[f"{b+1}-{b+10}" for b in bins[:-1]])
                )
            else:
                st.markdown("<p class='big'>No votes</p>", unsafe_allow_html=True)
        with mid:
            st.markdown("<p class='mid muted'>Leaderboard</p>", unsafe_allow_html=True)
            board = db.leaderboard()
            if not board:
                st.write("—")
            for i, r in enumerate(board, 1):
                medal = {1: "🥇", 2: "🥈", 3: "🥉"}.get(i, f"{i}.")
                hl = "**" if r["id"] == team["id"] else ""
                st.markdown(
                    f"### {medal} {hl}{r['name']}{hl} — {r['score']:.1f}"
                    if i <= 3
                    else f"{medal} {hl}{r['name']}{hl} — {r['score']:.1f}  "
                         f"<span class='muted'>({r['n']} votes)</span>",
                    unsafe_allow_html=True,
                )
        _board_watcher(signature)


# ------------------------------------------------------------------ admin view

def render_admin():
    st.title("🎛️ Host control")

    if not st.session_state.get("is_admin"):
        pin = st.text_input("Host PIN", type="password")
        if st.button("Unlock"):
            if pin == admin_pin():
                st.session_state["is_admin"] = True
                st.rerun()
            else:
                st.error("Wrong PIN.")
        st.stop()

    s = db.get_state()
    teams = db.list_teams()
    names = {t["id"]: f"{t['id']}. {t['name']}" for t in teams}

    # --- live controls -------------------------------------------------
    st.subheader("Live controls")
    c1, c2 = st.columns([2, 3])
    with c1:
        active = st.selectbox(
            "Team on stage",
            [t["id"] for t in teams],
            index=[t["id"] for t in teams].index(int(s["active_team"])),
            format_func=lambda i: names[i],
        )
        if str(active) != s["active_team"]:
            db.set_state(active_team=active, phase="waiting")
            st.rerun()
    with c2:
        st.metric("Current phase", phase_label(s["phase"]))
        st.metric("Votes for this team", db.vote_count(active))

    b1, b2, b3 = st.columns(3)
    if b1.button("🟢 Open voting", width="stretch"):
        db.set_state(phase="open"); st.rerun()
    if b2.button("🔴 Close voting", width="stretch"):
        db.set_state(phase="waiting"); st.rerun()
    if b3.button("🏆 Reveal score", width="stretch", type="primary"):
        db.set_state(phase="reveal"); st.rerun()

    nxt = active + 1 if active < db.N_TEAMS else 1
    if st.button(f"⏭️ Next team → {names[nxt]} (and close voting)", width="stretch"):
        db.set_state(active_team=nxt, phase="waiting"); st.rerun()

    st.divider()

    # --- setup ---------------------------------------------------------
    st.subheader("Setup")
    with st.form("setup"):
        title = st.text_input("Event title", s["event_title"])
        url = st.text_input(
            "Public app URL (used for the QR code)",
            s["public_url"],
            placeholder="https://your-app.streamlit.app",
        )
        st.caption("Paste the plain app URL with no query string — the QR sends people "
                   "straight to the voting screen.")
        if st.form_submit_button("Save"):
            db.set_state(event_title=title, public_url=url.strip())
            st.rerun()

    with st.expander("Team names & scene titles"):
        with st.form("teams"):
            edited = st.data_editor(
                pd.DataFrame(teams)[["id", "name", "scene"]],
                hide_index=True,
                width="stretch",
                disabled=["id"],
                column_config={
                    "id": st.column_config.NumberColumn("#", width="small"),
                    "name": st.column_config.TextColumn("Team name"),
                    "scene": st.column_config.TextColumn("Scene title (optional)"),
                },
            )
            if st.form_submit_button("Save teams"):
                for r in edited.to_dict("records"):
                    db.update_team(r["id"], str(r["name"]), str(r["scene"] or ""))
                st.rerun()

    st.divider()

    # --- results -------------------------------------------------------
    st.subheader("Results")
    board = db.leaderboard()
    if board:
        st.dataframe(
            pd.DataFrame(board)[["id", "name", "score", "mean", "median", "n", "low", "high"]]
            .rename(columns={"id": "#", "name": "Team", "score": "Official (trimmed)",
                             "mean": "Raw avg", "median": "Median", "n": "Votes",
                             "low": "Min", "high": "Max"})
            .round(1),
            hide_index=True,
            width="stretch",
        )
        buf = io.StringIO()
        pd.DataFrame(db.all_votes()).to_csv(buf, index=False)
        st.download_button("⬇️ Download every vote (CSV)", buf.getvalue(),
                           "scene_battle_votes.csv", "text/csv")
    else:
        st.info("No votes yet.")

    with st.expander("⚠️ Danger zone"):
        if st.button(f"Delete votes for {names[active]}"):
            db.clear_team_votes(active); st.rerun()
        confirm = st.text_input("Type RESET to wipe every vote")
        if st.button("Wipe all votes") and confirm == "RESET":
            db.clear_all_votes(); st.rerun()

    st.divider()
    if s["public_url"]:
        st.caption(f"Projection screen: `{s['public_url']}?view=board`")
        st.image(qr_data_uri(s["public_url"], scale=6), width=180, caption="Voting QR")


# ------------------------------------------------------------------ router

view = st.query_params.get("view", "vote")
if view == "board":
    render_board()
elif view == "admin":
    render_admin()
else:
    render_vote()
