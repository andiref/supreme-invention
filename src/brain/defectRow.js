// ============================================
// defectRow.js — normalizes one raw defect record into the shape every
// other brain module (metrics, time analysis, CAPA, reports) expects.
// ============================================

import { parseDateTime, isoWeek, formatDate, shiftForHour } from './datetime.js';

/**
 * @typedef {Object} DefectRow
 * @property {Date} datetime
 * @property {string} dtStr        original "MM/DD/YYYY HH:MM:SS" string
 * @property {string} week         ISO week, e.g. "2026-W17"
 * @property {string} dateStr      "MM/DD/YYYY"
 * @property {number} hour
 * @property {string} shift        "Morning" | "Afternoon" | "Night"
 * @property {number} dow          0=Sunday..6=Saturday
 * @property {string} customer
 * @property {string} model
 * @property {string} sn           serial number
 * @property {string} side         "TOP" | "BOT"
 * @property {string} comp         component reference designator
 * @property {string} defect       defect type name
 */

/**
 * Builds a DefectRow from the 7 raw import fields, or returns null if the
 * timestamp can't be parsed. "BOTTOM" is normalized to "BOT".
 * @returns {DefectRow|null}
 */
export function buildDefectRow(dtStr, customer, model, sn, side, comp, defect) {
  const dt = parseDateTime(dtStr);
  if (!dt) return null;
  return {
    datetime: dt,
    dtStr,
    week: isoWeek(dt),
    dateStr: formatDate(dt),
    hour: dt.getHours(),
    shift: shiftForHour(dt.getHours()),
    dow: dt.getDay(),
    customer,
    model,
    sn,
    side: String(side || '').toUpperCase().replace('BOTTOM', 'BOT'),
    comp,
    defect,
  };
}
