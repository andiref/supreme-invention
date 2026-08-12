// ============================================
// datetime.js — parsing & formatting for defect timestamps
// Pure functions: string/Date in, string/Date/number out. No DOM.
// ============================================

/**
 * Parses "MM/DD/YYYY HH:MM(:SS)" into a Date, or null if it doesn't match.
 * This is the exact format the import pipeline normalizes every row to.
 */
export function parseDateTime(str) {
  const s = String(str || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, min, ss] = m;
  return new Date(+yyyy, +mm - 1, +dd, +hh, +min, +(ss || 0));
}

/** ISO 8601 week label, e.g. "2026-W17". */
export function isoWeek(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  const week1 = new Date(dt.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(
    ((dt - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  );
  return `${dt.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** "MM/DD/YYYY" for display. */
export function formatDate(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Maps an hour-of-day (0-23) to a shift name. */
export function shiftForHour(hour) {
  if (hour >= 7 && hour < 15) return 'Morning';
  if (hour >= 15 && hour < 23) return 'Afternoon';
  return 'Night';
}

/**
 * Formats a JS Date as "MM/DD/YYYY HH:MM:SS" — the exact string
 * parseDateTime() expects. Used for real Excel date cells encountered
 * during import (SheetJS parses those into Date objects).
 */
export function formatDateTimeForImport(d) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** Short relative time ("3m ago", "2h ago"), falling back to formatDate(). */
export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(new Date(ts));
}
