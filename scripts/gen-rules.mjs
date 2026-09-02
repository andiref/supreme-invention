#!/usr/bin/env node
// ============================================
// gen-rules.mjs — renders firebase.rules.json from firebase.rules.template.json
// by substituting __OWNER_EMAIL__ with OWNER_EMAIL (from .env/.env.local or the
// environment). This keeps the real owner email out of git entirely — it's the
// same value the API already reads server-side, just also applied to the DB
// rules at deploy time.
//
// Usage: node scripts/gen-rules.mjs   (or `npm run rules:build`)
// Then:  firebase deploy --only database
//
// firebase.rules.json is generated and gitignored — never edit it by hand,
// and never commit it. Edit firebase.rules.template.json instead.
// ============================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Minimal .env loader — avoids pulling in a dotenv dependency for one value.
// Later files win only for keys not already set (so real env vars, e.g. in CI,
// always take priority over a local .env).
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!m || m[1].startsWith('#')) continue;
    const key = m[1];
    let value = m[2];
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv(join(root, '.env'));
loadDotEnv(join(root, '.env.local'));

const ownerEmail = (process.env.OWNER_EMAIL || '').trim();
if (!ownerEmail) {
  console.error('✗ OWNER_EMAIL is not set (checked .env, .env.local, and the environment).');
  console.error('  Set it — the same value the /api/* owner check uses — then re-run this script.');
  process.exit(1);
}

const templatePath = join(root, 'firebase.rules.template.json');
const outPath = join(root, 'firebase.rules.json');
const template = readFileSync(templatePath, 'utf8');
const rendered = template.replace(/__OWNER_EMAIL__/g, ownerEmail);

// Sanity check: fail loudly rather than writing broken rules if the
// substitution somehow produced invalid JSON (e.g. an unescaped quote in
// OWNER_EMAIL).
JSON.parse(rendered);

writeFileSync(outPath, rendered);
console.log(`✓ Wrote ${outPath} for owner ${ownerEmail}`);
