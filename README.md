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

Authentication and Firebase rules from v3 remain in place. Replace the owner placeholder in `firebase.rules.json` before deployment.
