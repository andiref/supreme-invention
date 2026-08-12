// ============================================
// filters.js — shared week/customer/model filtering
// ============================================

/** @typedef {{ week: string, customer: string, model: string }} FilterSpec — 'ALL' means no filter on that field */

/** Filters raw DefectRow[] by an {week, customer, model} spec ('ALL' = no filter). */
export function filterDefectRows(rows, f) {
  return rows.filter((d) =>
    (f.week === 'ALL' || d.week === f.week) &&
    (f.customer === 'ALL' || d.customer === f.customer) &&
    (f.model === 'ALL' || d.model === f.model)
  );
}

/** Filters MetricRow[] by the same spec. */
export function filterMetrics(metrics, f) {
  return metrics.filter((m) =>
    (f.week === 'ALL' || m.week === f.week) &&
    (f.customer === 'ALL' || m.customer === f.customer) &&
    (f.model === 'ALL' || m.model === f.model)
  );
}

/** Distinct, sorted list of weeks present in a MetricRow[] or DefectRow[]. */
export function distinctWeeks(rows) {
  return [...new Set(rows.map((r) => r.week))].sort();
}

/** Distinct, sorted list of customers present in a MetricRow[] or DefectRow[]. */
export function distinctCustomers(rows) {
  return [...new Set(rows.map((r) => r.customer))].sort();
}

/** Distinct, sorted list of models present in a MetricRow[] or DefectRow[]. */
export function distinctModels(rows) {
  return [...new Set(rows.map((r) => r.model))].sort();
}
