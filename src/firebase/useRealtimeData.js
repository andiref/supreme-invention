// ============================================
// useRealtimeData.js — realtime Firebase listeners, translated into React
// state. Each hook owns exactly one Firebase path and returns plain data
// (already run through the brain layer where relevant, e.g. buildDefectRow).
// No component ever touches `firebase/database` directly.
// ============================================
import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from './config.js';
import { buildDefectRow } from '../brain/defectRow.js';

/** Subscribes to a path, retrying on transient errors (not on permission errors). */
function useFirebaseValue(path, transform, ready) {
  const [value, setValue] = useState(transform(null));
  const [error, setError] = useState(null);
  // Starts true and stays true until the first snapshot (or error) actually
  // arrives — an empty array before that point means "haven't heard from
  // Firebase yet", not "confirmed there's no data". Without this, a fresh
  // login briefly renders every view's empty state before real data streams
  // in, which reads as broken for a moment.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return undefined;
    let retries = 3;
    let timer;
    let unsub;

    function attach() {
      const r = ref(db, path);
      unsub = onValue(
        r,
        (snap) => {
          setValue(transform(snap.val()));
          setError(null);
          setLoading(false);
        },
        (err) => {
          console.error(`Firebase error on ${path}:`, err);
          const isPermissionError = err?.code?.includes('PERMISSION_DENIED');
          if (!isPermissionError && retries > 0) {
            retries--;
            timer = setTimeout(attach, 2000);
          } else {
            setError(err);
            setLoading(false);
          }
        }
      );
    }
    attach();

    return () => {
      if (unsub) unsub();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ready]);

  return { value, error, loading };
}

/** Live defect rows, reconstructed into full DefectRow objects via the brain layer. */
export function useDefects(ready) {
  return useFirebaseValue(
    'smt_defects',
    (raw) => {
      if (!raw) return [];
      return Object.values(raw)
        .map((r) => buildDefectRow(r.dtStr, r.customer, r.model, r.sn, r.side, r.comp, r.defect))
        .filter(Boolean);
    },
    ready
  );
}

/** Live production volume rows. */
export function useProdVol(ready) {
  return useFirebaseValue(
    'smt_prodvol',
    (raw) => {
      if (!raw) return [];
      return Object.values(raw).map((r) => ({
        week: r.week, customer: r.customer, model: r.model,
        inspTOP: r.inspTOP || 0, inspBOT: r.inspBOT || 0,
      }));
    },
    ready
  );
}

/** Live CAPA records, keyed by chain key (raw shape — brain/capaLogic.js consumes this directly). */
export function useCapaData(ready) {
  return useFirebaseValue('smt_capa', (raw) => raw || {}, ready);
}

/** Live equipment/parts follow-up items, as an array with `_id` attached. */
export function useEquipment(ready) {
  return useFirebaseValue(
    'smt_equipment',
    (raw) => (raw ? Object.entries(raw).map(([id, item]) => ({ ...item, _id: id })) : []),
    ready
  );
}

/** Firebase Realtime Database connection state. */
export function useConnectionStatus(ready) {
  const { value } = useFirebaseValue('.info/connected', (v) => !!v, ready);
  return value;
}
