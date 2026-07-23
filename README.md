# 🎭 Scene Battle — audience rating app

A Slido-style voting app for one specific game: **12 teams each perform a scene, and the
audience rates every scene from 1 to 100.** Everyone votes from their phone by scanning a
QR code. The projector shows the live vote count, then the reveal.

One Streamlit app serves three different screens:

| Screen | URL | Who opens it |
|---|---|---|
| **Phone** (voting) | `https://YOUR-APP.streamlit.app` | the audience, via QR code |
| **Projection** | `https://YOUR-APP.streamlit.app/?view=board` | the laptop plugged into the projector |
| **Host control** | `https://YOUR-APP.streamlit.app/?view=admin` | you (PIN protected) |

---

## 1. Put it on GitHub

From this folder:

```bash
git init -b main
```

```bash
git add . && git commit -m "Scene Battle voting app"
```

Create an empty repo on GitHub (`scene-vote`, public or private — Streamlit can read both),
then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/scene-vote.git
```

```bash
git push -u origin main
```

## 2. Deploy on Streamlit Community Cloud

1. Go to <https://share.streamlit.io> and sign in with your Google account
   (`yousseftannoury11@gmail.com`) — the same one linked to GitHub.
2. **Create app → Deploy a public app from GitHub**.
3. Repository `YOUR-USERNAME/scene-vote`, branch `main`, main file path `app.py`.
4. Open **Advanced settings → Secrets** *before* clicking Deploy and paste:

   ```toml
   admin_pin = "pick-a-pin-here"
   ```

   Without this the host PIN falls back to `1234`, which anyone could guess.
5. Deploy. You get a URL like `https://scene-vote.streamlit.app`.

## 3. Set it up before the game

1. Open `.../?view=admin`, enter your PIN.
2. Under **Setup**, paste your app URL (e.g. `https://scene-vote.streamlit.app`) — with no
   `?view=` on the end — and press **Save**. This is what the QR code encodes.
3. Optional: expand **Team names & scene titles** and type the 12 real team names.
4. Open `.../?view=board` on the projector laptop and put it fullscreen (**F11**).

The QR code now appears on the projection. That is the only thing the audience needs.

---

## Running it on your own laptop first

```bash
pip install -r requirements.txt
```

```bash
python -m streamlit run app.py
```

Then open <http://localhost:8501>. To let phones on the same Wi-Fi reach it, use the
"Network URL" that Streamlit prints, and paste that URL into the admin Setup box so the QR
code points at it.

---

## How the scoring works

Each vote is an integer from 1 to 100. Two numbers are computed per team:

- **Raw average** — the plain mean of every vote.
- **Official score (trimmed mean)** — the mean after dropping the highest 10% and lowest
  10% of votes. This is the number shown large on the projector and used for the ranking.

The trim exists because in a room where teams vote on each other, a handful of people give
their friends 100 and everyone else 1. Dropping the extremes makes those cancel out. With
fewer than about 5 votes the trim is skipped and the plain mean is used.

---

## Constraints — read this before game night

**These are the real limits of this setup. None of them are blocking for a one-evening
game, but you should know them.**

1. **Votes are stored in a file on the server, and Streamlit Cloud wipes that file when the
   app restarts.** The app sleeps after inactivity, and rebooting or redeploying it clears
   every vote. In practice: don't redeploy mid-game, and **press "Download every vote (CSV)"
   in the admin screen after each team's reveal.** That CSV is your only backup.
2. **One vote per device, not per person.** Identity is a random token stored in the phone's
   URL. Someone determined can open a private tab and vote twice. The trimmed mean limits
   the damage; a stricter system would need real logins, which would kill the "scan and go"
   speed.
3. **Refreshing a phone's page keeps its identity, but only because the token lives in the
   URL.** If someone re-scans the QR code they get a *new* token and can vote again on the
   current team. Tell the audience to keep the page open rather than re-scanning.
4. **Streamlit Community Cloud is one small container.** It comfortably handles a room of
   roughly 100–200 phones for this app, because phones only poll a tiny status query every
   4 seconds and the projector every 2. It is not built for thousands.
5. **Everyone needs internet on their phone.** If the venue Wi-Fi is bad, run the app on
   your laptop instead and have everyone join the laptop's hotspot (see the local-run
   section above).
6. **Anyone with the link can vote** — there is no gate on the voting page. That is
   deliberate, so people can join in one scan. Only the host screen is PIN protected.
7. **Scores stay hidden until you press Reveal.** The projector shows only a vote *count*
   while voting is open. This is on purpose: showing a running average makes later voters
   copy the earlier ones.
8. **The app has no concept of "who is in which team".** Team members can rate their own
   scene. If that matters, say out loud that people shouldn't vote for themselves.

---

## Files

| File | What it is |
|---|---|
| `app.py` | all three screens and the routing between them |
| `db.py` | SQLite storage, vote de-duplication, trimmed-mean scoring |
| `requirements.txt` | the three dependencies |
| `.streamlit/config.toml` | dark theme, hidden Streamlit chrome |
| `HOST-CHEATSHEET.md` | the one page to have open while running the game |
