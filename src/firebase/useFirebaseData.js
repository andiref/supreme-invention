// ============================================
// useFirebaseData.js — on-demand Firebase reads, translated into React state.
// The app is intentionally single-user and NOT live-synced: each hook reads
// its Firebase path once per refresh cycle. Components never touch
// firebase/database directly.
// ============================================
import { useCallback, useEffect, useState } from 'react';
import { get, ref } from 'firebase/database';
import { db } from './config.js';
import { buildDefectRow } from '../brain/defectRow.js';

/** Reads a path on demand, with a small retry for transient failures. */
function useFirebaseValue(path, transform, ready, refreshKey = 0) {
  const [value, setValue] = useState(transform(null));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const snap = await get(ref(db, path));
        setValue(transform(snap.val()));
        setLoading(false);
        return;
      } catch (err) {
        lastError = err;
        const isPermissionError = err?.code?.includes('PERMISSION_DENIED');
        if (isPermissionError || attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }

    console.error(`Firebase read error on ${path}:`, lastError);
    setError(lastError);
    setLoading(false);
  }, [path, ready, transform]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return { value, error, loading, refresh: load };
}

const transformDefects = (raw) => {
  if (!raw) return [];
  return Object.values(raw)
    .map((r) => buildDefectRow(r.dtStr, r.customer, r.model, r.sn, r.side, r.comp, r.defect))
    .filter(Boolean);
};

const transformProdVol = (raw) => {
  if (!raw) return [];
  return Object.values(raw).map((r) => ({
    week: r.week, customer: r.customer, model: r.model,
    inspTOP: r.inspTOP || 0, inspBOT: r.inspBOT || 0,
  }));
};

const transformCapa = (raw) => raw || {};

const transformEquipment = (raw) => (raw ? Object.entries(raw).map(([id, item]) => ({ ...item, _id: id })) : []);

/** Reads defect rows from the cloud when the app refreshes. */
export function useDefects(ready, refreshKey) {
  return useFirebaseValue('smt_defects', transformDefects, ready, refreshKey);
}

/** Reads production volume when the app refreshes. */
export function useProdVol(ready, refreshKey) {
  return useFirebaseValue('smt_prodvol', transformProdVol, ready, refreshKey);
}

/** Reads CAPA records when the app refreshes. */
export function useCapaData(ready, refreshKey) {
  return useFirebaseValue('smt_capa', transformCapa, ready, refreshKey);
}

/** Reads equipment/parts follow-up items when the app refreshes. */
export function useEquipment(ready, refreshKey) {
  return useFirebaseValue('smt_equipment', transformEquipment, ready, refreshKey);
}
