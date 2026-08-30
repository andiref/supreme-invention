import { DEFECT_IMPORT_BATCH_SIZE, PRODVOL_IMPORT_BATCH_SIZE, newImportId } from '../brain/importParsing.js';
import { auth } from '../firebase/config.js';

async function authHeaders() {
  const current = auth.currentUser;
  if (!current) throw new Error('Your session has expired. Please sign in again.');
  const token = await current.getIdToken();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) });
  let data;
  try { data = await res.json(); } catch { throw new Error(`Network error (HTTP ${res.status})`); }
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function login() {
  const data = await post('/api/users', { action: 'login' });
  return data.user;
}

async function importInBatches(action, rows, batchSize, extra, onProgress) {
  let totalCount = 0;
  let totalDuplicates = 0;
  const totalBatches = Math.max(1, Math.ceil(rows.length / batchSize));
  for (let i = 0; i < rows.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = rows.slice(i, i + batchSize);
    onProgress?.(i, rows.length, batchNum, totalBatches);
    try {
      const data = await post('/api/yield', { action, rows: batch, ...extra });
      totalCount += data.count;
      totalDuplicates += data.duplicates || 0;
    } catch (err) {
      err.batchNum = batchNum;
      err.totalBatches = totalBatches;
      err.importedSoFar = totalCount;
      err.duplicatesSoFar = totalDuplicates;
      throw err;
    }
  }
  onProgress?.(rows.length, rows.length, totalBatches, totalBatches);
  return { count: totalCount, duplicates: totalDuplicates };
}

export function importDefects(rows, fileName, onProgress) {
  return importInBatches('importDefects', rows, DEFECT_IMPORT_BATCH_SIZE, { importId: newImportId(), fileName }, onProgress);
}

export function importProdVol(rows, fileName, onProgress) {
  return importInBatches('importProdVol', rows, PRODVOL_IMPORT_BATCH_SIZE, { importId: newImportId(), fileName }, onProgress);
}

export async function listRecentImports() { const data = await post('/api/yield', { action: 'listImports' }); return data.imports || []; }
export async function undoImport(importId) { return post('/api/yield', { action: 'undoImport', importId }); }
export async function saveCapa(payload) { return post('/api/capa', { action: 'save', ...payload }); }
export async function deleteCapa(payload) { return post('/api/capa', { action: 'delete', ...payload }); }
export async function addEquipment(payload) { return post('/api/equipment', { action: 'add', ...payload }); }
export async function updateEquipment(id, payload) { return post('/api/equipment', { action: 'update', id, ...payload }); }
export async function deleteEquipment(id) { return post('/api/equipment', { action: 'delete', id }); }
