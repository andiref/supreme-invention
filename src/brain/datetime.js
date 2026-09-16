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
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, min, ss] = m;
  const month = +mm;
  const day = +dd;
  const year = +yyyy;
  const hour = +hh;
  const minute = +min;
  const second = +(ss || 0);
  if (month < 1 || month > 12 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

  // Date() silently normalizes invalid calendar dates such as 02/30/2025.
  // Round-trip the components so malformed source data is rejected instead.
  const dt = new Date(year, month - 1, day, hour, minute, second);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day ||
    dt.getHours() !== hour ||
    dt.getMinutes() !== minute ||
    dt.getSeconds() !== second
  ) return null;

  return dt;
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

/** Monday of a given ISO week label ("2026-W30") as a Date, or null if the
 * label doesn't parse. Monday of ISO week 1 is always the Monday on/before
 * Jan 4 — every other week's Monday is 7 days further along from there. */
export function isoWeekStart(weekLabel) {
  const m = String(weekLabel).match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const year = +m[1];
  const weekNum = +m[2];
  const jan4 = new Date(year, 0, 4);
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (weekNum - 1) * 7);
  return monday;
}

/**
 * Maps an ISO week label ("2026-W30") to the calendar month that owns the
 * majority of that week's 7 days ("YYYY-MM") — for a week that straddles
 * two months, whichever month has more days in it (4 vs 3; a 7-day week
 * can never tie) wins the whole week. Equivalent to "the week belongs to
 * the month containing its Thursday". Used for monthly KPI roll-ups, since
 * production weeks don't line up with calendar months.
 */
export function weekToMonth(weekLabel) {
  const monday = isoWeekStart(weekLabel);
  if (!monday) return null;
  const counts = new Map();
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let bestKey = null;
  let bestCount = -1;
  counts.forEach((count, key) => {
    if (count > bestCount) { bestCount = count; bestKey = key; }
  });
  const [y, mo] = bestKey.split('-').map(Number);
  return `${y}-${String(mo + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-07" -> "July 2026". */
export function formatMonthLabel(monthKey) {
  const m = String(monthKey).match(/^(\d{4})-(\d{2})$/);
  if (!m) return monthKey;
  return `${MONTH_NAMES[+m[2] - 1]} ${m[1]}`;
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
