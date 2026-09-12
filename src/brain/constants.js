// ============================================
// constants.js — shared thresholds & reference data
// Pure data. No DOM, no framework.
// ============================================

/** Yield target percentage. A week/model is "on target" at or above this. */
export const YIELD_TARGET = 99.5;

/** DPPM (defects per million parts) ceiling. At or below this is "on target". */
export const DPPM_LIMIT = 5000;

/** Report/digest trend range cap, in weeks — keeps charts and cards readable. */
export const REPORT_MAX_WEEKS = 11;

/**
 * Display label + colors for each Top-3 defect rank position (1st/2nd/3rd)
 * in the weekly digest — rank alone sets the severity tag (HIGH/MODERATE/
 * WATCH) and the numbered badge/left-bar color; a separate "RISING" tag is
 * added on top when a defect's count increased vs. the previous week.
 */
export const DEFECT_RANK_META = [
  { label: 'HIGH', tone: 'red', barColor: '#dc2626' },
  { label: 'MODERATE', tone: 'orange', barColor: '#f59e0b' },
  { label: 'WATCH', tone: 'amber', barColor: '#eab308' },
];

export const SHIFTS = [
  { name: 'Morning', label: 'Morning (07-15)', color: '#3b82f6' },
  { name: 'Afternoon', label: 'Afternoon (15-23)', color: '#f59e0b' },
  { name: 'Night', label: 'Night (23-07)', color: '#a78bfa' },
];

export const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** Chart series color cycle. */
export const CHART_COLORS = [
  '#3b82f6', '#f59e0b', '#22c55e', '#ef4444',
  '#a78bfa', '#f472b6', '#34d399', '#fb923c',
];

export const CAPA_STATUSES = ['Open', 'Monitoring', 'Effective', 'Closed'];

export const EQUIPMENT_STATUSES = [
  'Requested', 'Ordered', 'In Transit', 'Received', 'Installed', 'Cancelled',
];
