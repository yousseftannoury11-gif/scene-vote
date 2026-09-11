# DrumTune Pro

A professional drum tuner for snare, kick, and toms. Uses your phone's microphone to measure lug pitch and help you achieve perfect drum tuning.

## Features

- **Lug Tuning Map** — Visual guide showing which lugs are in tune
- **Pitch Mode** — Real-time frequency detection for precise tuning
- **Kit Manager** — Save and manage tuning presets for different drums
- **Tuning Presets** — Quick templates for common drum types
- **Tools** — Additional utilities for advanced tuning
- **Offline Ready** — Works completely offline as a Progressive Web App

## Getting Started

### On iPhone

1. Open Safari and go to the app URL
2. Tap Share → Add to Home Screen
3. Tap "Add" to install as an app
4. Open the app and allow microphone access when prompted

### Tuning Technique

- Tap near a lug, about 1 inch from the rim
- Muffle the center of the drum head with your finger for clearer readings
- Hold your phone 10–20 cm above the drum head
- Adjust each lug until the pitch is where you want it

## Running Locally

The app requires HTTPS or localhost for microphone access.

### With npx

```
npx serve drum-tuner
```

### With Python

```
cd drum-tuner
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Deploying

The app includes a GitHub Pages deployment workflow (`.github/workflows/pages.yml`) that automatically publishes to GitHub Pages when you push to `main` or the claude/drums branch.

To enable:
1. Go to your repository Settings → Pages
2. Set "Build and deployment" source to "GitHub Actions"
3. Push to trigger deployment

## Moving to Its Own Repository

### Option 1: Git Subtree Split

```bash
git subtree split --prefix drum-tuner -b drum-tuner-only
git push <new-repo-url> drum-tuner-only:main
```

### Option 2: Copy and Create New Repo

```bash
cp -r drum-tuner /path/to/new-repo
cd /path/to/new-repo
git init
git add .
git commit -m "Initial commit"
git remote add origin <new-repo-url>
git push -u origin main
```

## Tech Stack

Vanilla JavaScript, no frameworks. Works offline with Service Worker caching.

## License

MIT.
