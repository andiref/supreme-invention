# SMT Report Center v3

A React + Vite SMT yield / DPPM / CAPA / equipment dashboard with secure Firebase Authentication, realtime data, data-health validation, and customer reporting.

## V3 upgrades

- Firebase Email/Password authentication; verified accounts only.
- API endpoints require a Firebase ID token and re-validate the owner email server-side.
- Browser Firebase reads are owner-gated by `firebase.rules.json`; API writes use the server Firebase service account.
- New **Data Health** dashboard for unmatched joins, duplicate production keys, zero/negative volume, CAPA aging, and chronic defects.
- Existing Yield, Time, Library, Report, CAPA, Equipment, import/undo flows preserved.
- API client now uses bearer-token auth instead of the legacy `X-User-Email` header.

## Firebase setup

1. In Firebase Console → Authentication → Sign-in method, enable **Email/Password**.
2. Create the owner user account and verify the email address.
3. Replace `OWNER_EMAIL_REPLACE_ME` in `firebase.rules.json` with the exact lower-case owner email, then deploy the rules (for example with `firebase deploy --only database`).
4. In Vercel, set:
   - `OWNER_EMAIL`
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
5. `FIREBASE_PRIVATE_KEY` should contain the service-account private key with literal `\\n` line breaks if stored as one Vercel variable.

The web API key is not a secret; the Firebase service-account private key is.

## Run locally

```bash
npm install
npm run dev
```

## Validation

```bash
npm run build
npm run test:brain
```

The `brain/` layer is intentionally pure and should be the main location for regression tests around quality calculations and data validation.
