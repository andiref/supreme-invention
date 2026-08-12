# SMT Report Center v2

A rebuild of the original `supreme-invention` app. Same Firebase project, same
Vercel API, same features — but the business logic ("the brain") is now a
clean, framework-agnostic layer with zero DOM coupling, and the UI is React
components instead of `document.getElementById` + inline `onclick` handlers.

## Why this is easier to work with

The old `js/yield.js` (2,100 lines) mixed defect-math, DOM writes, and canvas
drawing in the same functions. Changing how a KPI looks meant editing the
same function that calculated it. Here, calculation and rendering are two
different files:

```
src/brain/        pure functions — (data) -> data, no DOM, no fetch, no React.
                   Unit-testable in plain Node (see scripts/smoke-test-brain.mjs).
src/api/client.js  the only file that calls fetch() against /api/*
src/firebase/      the only files that touch the Firebase SDK
src/components/    React components — presentation only, call into brain/ + api/
```

Want to change how yield% is calculated? Edit `src/brain/metrics.js` — one
file, no UI code nearby. Want to change how it's *displayed*? Edit
`src/components/views/YieldView.jsx` — the math doesn't move.

## Setup

```bash
npm install
```

### Environment

The `/api/*` functions are unchanged from the original and need the same
Vercel environment variables (Project Settings → Environment Variables):

| Variable | Purpose |
|---|---|
| `FIREBASE_PROJECT_ID` | your Firebase project id |
| `FIREBASE_CLIENT_EMAIL` | service account client email |
| `FIREBASE_PRIVATE_KEY` | service account private key |
| `OWNER_EMAIL` | the single email allowed to log in |

The frontend's Firebase config (`src/firebase/config.js`) is the public
client config — safe to commit, same as the original.

### Local development

```bash
npm run dev
```

Vite serves the React app on `localhost:5173` and proxies `/api/*` to
`VITE_API_PROXY_TARGET` (defaults to `localhost:3000` — run `vercel dev`
alongside this, or point it at your deployed URL, e.g.:

```bash
VITE_API_PROXY_TARGET=https://your-app.vercel.app npm run dev
```

### Deploying

```bash
npm run build
```

Deploy the `dist/` folder + the `api/` folder to Vercel exactly like the
original (the `api/` folder here is a straight, unmodified copy).

### Testing the brain layer

```bash
npm run test:brain
```

Runs `scripts/smoke-test-brain.mjs` — a quick end-to-end sanity check against
sample data. Not a full test suite, but a good starting point: every function
in `src/brain/` is a pure function, so adding real unit tests (Vitest, etc.)
from here is straightforward.

## What changed vs. the original

- **Charts**: hand-rolled canvas drawing → [Recharts](https://recharts.org).
  Less code, easier to restyle.
- **PNG report export**: was drawn twice (once on screen, once to canvas for
  the image) → now a single React component (`ReportSnapshot`) rendered once
  and snapshotted with `html2canvas`. What you see is exactly what exports.
- **State**: global `var`s (`rawDef`, `capaData`, etc.) → React state +
  realtime Firebase hooks (`useDefects`, `useCapaData`, ...).
- Everything else — API contracts, Firebase project, CSS, feature set — is
  intentionally unchanged, so this is a drop-in replacement for the old
  frontend, not a different app.

## What to extend next

- The `src/brain/` layer has no test suite beyond the smoke test — worth
  backfilling with real unit tests (Vitest) before making changes to it.
- `dist/assets/index-*.js` is ~1.3MB — recharts + xlsx + html2canvas are the
  biggest contributors. Worth code-splitting (`React.lazy`) per view if
  initial load time matters.
- CAPA chronic-week detection (`buildWeeklyTop3Map` / `chronicWeekCount` in
  `src/brain/capaLogic.js`) is extracted and tested but not yet wired into
  any component — the original didn't surface it in the UI either, but it's
  there if you want to add a "chronic" badge to CAPA cards.
