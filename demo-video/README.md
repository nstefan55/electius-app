# Electius — demo video (Studentski zbor)

A [Remotion](https://www.remotion.dev) project that renders a ~1:15 product demo, in Croatian, of
an administrator at **Sveučilište u Zagrebu** creating an election for the **Studentski zbor**
with the 5-step wizard.

All data is made up (`src/data.ts`). The screens are recreations of the real components in
`src/components/elections/wizard/*` and the dashboard, using the app's design tokens and
`messages/hr.json` copy, so they match the app without needing a running database.

## Cut

| Scene | What happens |
| --- | --- |
| Intro | Electius + "Izrada izbora za Studentski zbor", UNIZG demo badge |
| Početna | Dashboard → **Novi izbor** |
| Korak 1 | Title + description typed, Standardni / Jedan izbor |
| Korak 2 | 4 candidates added, **Dopusti suzdržane** on |
| Korak 3 | `studenti_unizg_2026.csv` dragged in → 348 voters |
| Korak 4 | Scheduled 10. 11. 08:00 → 12. 11. 20:00, live + public results, 20 % quorum, voter reminders |
| Korak 5 | Review → **Izradi izbore** |
| Gotovo | "Izbori su izrađeni" + QR code |
| Outro | What happens next (invites, voting on phone, results/audit) |
| End card | electius.com |

## Commands

This folder is its own npm project (it is excluded from the app's `tsconfig.json` and ESLint).

```bash
cd demo-video
npm install
npm run studio   # live preview + timeline scrubbing in the browser
npm run render   # → out/electius-demo-studentski-zbor.mp4 (1920×1080, 30 fps, H.264)
```

`AppWalkthrough` is also registered as its own composition (the screen-recording part only),
which is quicker to iterate on.

## Changing things

- **Names, numbers, dates** — `src/data.ts`.
- **Pacing** — `src/timeline.ts`. The cut is computed from typing speeds and text lengths, so
  editing a candidate's name re-times everything after it.
- **Camera and scroll** — the `CAM` / `SCROLL` keyframes in `src/scenes/AppDemo.tsx`.
- **Narration cards** — `CUES` in the same file.

The cursor targets elements by `data-anchor` and measures them on every frame, so layout changes
do not need re-calibration.
