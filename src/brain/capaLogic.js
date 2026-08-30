// ============================================
// capaLogic.js — CAPA tracker: one CHAIN per (customer, defect, model,
// component). A chain accumulates a `history` map keyed by week, one
// entry per week that exact combo got a save. If the same combo goes
// quiet and later reappears, it naturally resumes the same chain instead
// of starting a new one.
//
// This module is pure: given the CAPA records (as stored in Firebase, one
// object keyed by chain key) plus the current week's report data, it
// computes what cards to show, in what order, matching what search. All
// DOM rendering / fetch calls live in the UI layer.
// ============================================

import { CAPA_STATUSES } from './constants.js';

const CAPA_STATUS_COLORS = { Open: '#ef4444', Monitoring: '#f59e0b', Effective: '#14b8a6', Closed: '#22c55e' };

export function capaStatusColor(status) {
  return CAPA_STATUS_COLORS[status] || '#64748b';
}

/** Same char-stripping rule as the server's sanitizeKey() — MUST stay in sync. */
function sanitizeKeyPart(str, maxLen) {
  return String(str || '').replace(/[.#$[\]/]/g, '').trim().slice(0, maxLen);
}

/** Deterministic chain key for a (customer, defect, model, component) combo. */
export function capaKey(customer, defect, model, comp) {
  return [
    sanitizeKeyPart(customer, 60),
    sanitizeKeyPart(defect, 80),
    sanitizeKeyPart(model, 60),
    sanitizeKeyPart(comp, 40),
  ].join('__');
}

/**
 * Maps week -> that week's own top-3 defect names, for one customer's raw
 * rows. Used to compute how many of the last N weeks a defect was "chronic"
 * (i.e. in that week's own Top 3), independent of this week's ranking.
 */
export function buildWeeklyTop3Map(customerRows) {
  const weeks = [...new Set(customerRows.map((d) => d.week))];
  const map = {};
  weeks.forEach((w) => {
    const counts = {};
    customerRows.filter((d) => d.week === w).forEach((d) => { counts[d.defect] = (counts[d.defect] || 0) + 1; });
    map[w] = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
  });
  return map;
}

/** How many weeks (out of the weeklyTop3Map's range) a given defect appeared in that week's own Top 3. */
export function chronicWeekCount(weeklyTop3Map, defect) {
  return Object.values(weeklyTop3Map).filter((arr) => arr.includes(defect)).length;
}

/**
 * Builds the CAPA card list for one customer: this period's top-3
 * (ranked, with rank/count) PLUS any previously-saved chains for that
 * customer that are still open (not Closed, unless includeClosed) but have
 * since dropped out of the current top-3 — so a defect never silently
 * disappears just because it wasn't the worst one this particular week.
 *
 * @param {object} customerReportData  result of computeCustomerReportData() for this customer
 * @param {string} customer
 * @param {Record<string, object>} capaRecords  all CAPA records, keyed by capaKey()
 * @param {boolean} includeClosed
 */
export function getCustomerCapaCards(customerReportData, customer, capaRecords, includeClosed) {
  const t3 = customerReportData ? customerReportData.t3 : [];
  const cards = t3.map(([defect, count], i) => {
    const model = customerReportData ? customerReportData.topContributor(defect, 'model') : '';
    const comp = customerReportData ? customerReportData.topContributor(defect, 'comp') : '';
    // `count` = the defect TYPE's total this week (drives its Top-3 rank).
    // `modelCount` = how many of those are specifically this model+comp —
    // can be smaller if several models/components share the defect type.
    const modelCount = customerReportData ? customerReportData.countFor(defect, model, comp) : null;
    return { defect, count, rank: i + 1, model, comp, modelCount, key: capaKey(customer, defect, model, comp) };
  });

  const seenKeys = new Set(cards.map((c) => c.key));
  Object.keys(capaRecords || {}).forEach((key) => {
    const rec = capaRecords[key];
    if (!rec || rec.customer !== customer) return;
    if (seenKeys.has(key)) return;
    if (rec.monitoring === 'Closed' && !includeClosed) return;
    const count = customerReportData ? customerReportData.countFor(rec.defect, rec.model, rec.comp) : null;
    cards.push({ defect: rec.defect, count, rank: null, model: rec.model || '', comp: rec.comp || '', modelCount: count, key });
    seenKeys.add(key);
  });

  return cards;
}

/**
 * True if a card's chain matches a free-text search — checks the identity
 * fields plus the record's latest root cause, corrective action, and PIC.
 * @param {string} query already-lowercased
 */
export function capaCardMatchesSearch(customer, card, capaRecords, query) {
  if (!query) return true;
  const rec = capaRecords[card.key] || {};
  const haystack = [customer, card.defect, card.model, card.comp, card.key, rec.rootCause, rec.correctiveAction, rec.pic]
    .filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}


export { CAPA_STATUSES };
