# 🎭 Host cheat sheet — keep this open during the game

## Two windows on your laptop

| Window | URL | State |
|---|---|---|
| **Projection** (on the projector, press **F11**) | `YOUR-URL/?view=board` | leave it alone, it updates itself |
| **Control** (on your own screen) | `YOUR-URL/?view=admin` | this is where you click |

The audience only ever needs the **QR code on the projection**. Nothing else.

---

## Before you start

- [ ] Admin → **Setup** → app URL pasted and **Saved** (otherwise no QR code appears)
- [ ] Admin → **Team names & scene titles** → the 12 real names typed in
- [ ] Projection window open and fullscreen
- [ ] Say out loud: **"Scan once and keep the page open — don't re-scan between scenes."**

---

## The loop, repeated 12 times

```
1. Pick the team          Admin → "Team on stage" → choose the team
                          (the projector shows their name + the QR code)

2. They perform the scene

3. Open the vote          Admin → 🟢 Open voting
                          Every phone flips to the slider within ~4 seconds.
                          The projector shows the live count climbing.

4. Wait                   Watch the count on the projector stop rising.
                          Give it a "10 seconds left!"

5. Close the vote         Admin → 🔴 Close voting

6. Reveal                 Admin → 🏆 Reveal score
                          Big score + histogram + leaderboard on the projector.
                          Phones show the same score.

7. Save a backup          Admin → ⬇️ Download every vote (CSV)

8. Next team              Admin → ⏭️ Next team → …
```

---

## What each button does

| Button | Effect |
|---|---|
| 🟢 **Open voting** | phones show the 1–100 slider; projector shows a live count, no scores |
| 🔴 **Close voting** | phones go back to "waiting"; no new votes accepted |
| 🏆 **Reveal score** | shows the team's score, histogram and the running leaderboard everywhere |
| ⏭️ **Next team** | moves to the next team *and* closes voting |
| **Team on stage** | jump to any team; always closes voting first, so it is safe mid-game |

Voters can **change their vote** freely until you press Close or Reveal. That is intended —
it makes the "oops I dragged it wrong" problem disappear.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| A phone is stuck on "waiting" after you opened voting | wait 4 seconds, then refresh the page |
| Someone's QR scan opened a blank page | check their phone has internet; retry the scan |
| Projector still shows the old team | it self-corrects in ~2 seconds; if not, press F5 |
| You revealed too early | press 🟢 **Open voting** again — the old votes are all still there |
| A team got obviously trolled | the **Official score** already drops the top and bottom 10% of votes |
| You need to redo one team completely | Admin → ⚠️ **Danger zone** → "Delete votes for …", then open voting again |
| The app restarted and everything is gone | this can happen — that's why you download the CSV after each reveal |

---

## Reading the numbers on screen

- **The huge number during voting** = how many people have voted, *not* a score.
- **The huge number at reveal** = the official score (trimmed mean, 1–100).
- **"raw avg"** underneath = the untrimmed mean, for comparison.
- **The histogram** = how the audience split, in bands of 10.
