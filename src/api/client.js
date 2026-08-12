// ============================================
// api/client.js — thin wrappers around the existing /api/* Vercel
// endpoints (unchanged from the original app). This is the ONLY place
// that knows about fetch/HTTP — brain/ never imports this, and this
// never imports brain/. UI components call these functions and pass the
// results (or inputs) through brain/ for any calculation.
// ============================================

import { DEFECT_IMPORT_BATCH_SIZE, PRODVOL_IMPORT_BATCH_SIZE, newImportId } from '../brain/importParsing.js';

async function post(path, email, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Email': email },
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Network error (HTTP ${res.status})`);
  }
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── auth ───────────────────────────────────────────────────────────────
export async function login(email) {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Invalid email');
  return data.user;
}

// ─── yield: imports ─────────────────────────────────────────────────────
/**
 * Sends `rows` to /api/yield in sequential batches. Resolves with
 * aggregated {count, duplicates}. onProgress(done, total, batchNum, totalBatches).
 */
async function importInBatches(email, action, rows, batchSize, extra, onProgress) {
  let totalCount = 0;
  let totalDuplicates = 0;
  const totalBatches = Math.max(1, Math.ceil(rows.length / batchSize));
  for (let i = 0; i < rows.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = rows.slice(i, i + batchSize);
    onProgress?.(i, rows.length, batchNum, totalBatches);
    let data;
    try {
      data = await post('/api/yield', email, { action, rows: batch, ...extra });
    } catch (err) {
      err.batchNum = batchNum;
      err.totalBatches = totalBatches;
      err.importedSoFar = totalCount;
      err.duplicatesSoFar = totalDuplicates;
      throw err;
    }
    totalCount += data.count;
    totalDuplicates += data.duplicates || 0;
  }
  onProgress?.(rows.length, rows.length, totalBatches, totalBatches);
  return { count: totalCount, duplicates: totalDuplicates };
}

export function importDefects(email, rows, fileName, onProgress) {
  const importId = newImportId();
  return importInBatches(email, 'importDefects', rows, DEFECT_IMPORT_BATCH_SIZE, { importId, fileName }, onProgress);
}

export function importProdVol(email, rows, fileName, onProgress) {
  const importId = newImportId();
  return importInBatches(email, 'importProdVol', rows, PRODVOL_IMPORT_BATCH_SIZE, { importId, fileName }, onProgress);
}

export async function listRecentImports(email) {
  const data = await post('/api/yield', email, { action: 'listImports' });
  return data.imports || [];
}

export async function undoImport(email, importId) {
  return post('/api/yield', email, { action: 'undoImport', importId });
}

// ─── CAPA ───────────────────────────────────────────────────────────────
// payload: { customer, defect, week, rank?, count?, model?, comp?,
//            rootCause?, correctiveAction?, dueDate?, pic?, monitoring? }
export async function saveCapa(email, payload) {
  return post('/api/capa', email, { action: 'save', ...payload });
}

// Deletes one week's history entry (re-deriving the chain's mirror fields
// from whatever's now latest), or the whole chain if `week` is omitted.
// payload: { customer, defect, model?, comp?, week? }
export async function deleteCapa(email, payload) {
  return post('/api/capa', email, { action: 'delete', ...payload });
}

// ─── equipment ──────────────────────────────────────────────────────────
export async function addEquipment(email, payload) {
  return post('/api/equipment', email, { action: 'add', ...payload });
}

export async function updateEquipment(email, id, payload) {
  return post('/api/equipment', email, { action: 'update', id, ...payload });
}

export async function deleteEquipment(email, id) {
  return post('/api/equipment', email, { action: 'delete', id });
}
