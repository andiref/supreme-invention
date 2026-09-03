# SMT Quality Engineer Assistant v4

A single-user SMT quality analysis and report tool. The app is intentionally focused on one engineer using production Yield + Defect data to understand the problem quickly and generate the **SMT Digest** report.

## V4 focus

- **Quality Assistant**: deterministic analysis of Yield + Defect data, risk ranking, trend detection, SMT library causes/actions, and CAPA memory.
- **Import Intelligence**: existing Excel/CSV import and Data Health validation remain the source of truth.
- **SMT Digest export only**: the weekly multi-customer Digest PNG is retained. Customer-report PNG and CAPA XLSX exports were removed.
- **Historical analysis**: compare the selected week against previous weeks rather than relying on live collaboration features.

## Workflow

1. Import Defect Data and Production Volume.
2. Check **Data Health** for unmatched or invalid production combinations.
3. Open **Quality Assistant** and choose week/customer/model scope.
4. Review priority findings, top defect drivers, standard checks, and CAPA memory.
5. Use the **Report** tab to prepare the on-screen customer report and export the **SMT Digest PNG**.

## Important

The Quality Assistant is a deterministic engineering aid, not a replacement for process investigation or formal root-cause verification. Its recommendations come from the imported defect pattern and the built-in SMT defect library/CAPA history.

## Deployment

Authentication and Firebase rules from v3 remain in place, restricting `.read` to one verified owner email — same identity the `/api/*` endpoints check server-side (`OWNER_EMAIL`).

`firebase.rules.json` is generated, not committed, so the real owner email never ends up in git history:

1. Set `OWNER_EMAIL` in `.env` (same value used by the API).
2. Run `npm run rules:build` to render `firebase.rules.template.json` → `firebase.rules.json`.
3. Deploy as usual: `firebase deploy --only database`.

Edit `firebase.rules.template.json` (tracked in git, uses the `__OWNER_EMAIL__` placeholder) if the rules themselves need to change — never hand-edit `firebase.rules.json`, and never commit the real email in its place (see git history for why this matters — it happened twice before this script existed).


### Data sync model

This is a single-user engineering tool. Firebase remains the cloud source of truth, but the app intentionally uses on-demand reads rather than live listeners. Use the **↻ Refresh** control after changes or whenever you want the latest cloud snapshot. Imports, CAPA edits, and equipment changes automatically trigger a fresh snapshot.
