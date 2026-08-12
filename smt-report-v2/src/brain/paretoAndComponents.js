// ============================================
// paretoAndComponents.js — defect Pareto & top-failing-components tables
// ============================================

/**
 * Counts defects by type, sorted descending (a classic Pareto).
 * @param {DefectRow[]} rows
 * @returns {[string, number][]} [defectType, count] pairs, highest first
 */
export function paretoByDefectType(rows) {
  const counts = {};
  rows.forEach((d) => { counts[d.defect] = (counts[d.defect] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

/**
 * Ranks components (ref designators) by failure count, with their most
 * common defect, models seen, and sides affected.
 * @param {DefectRow[]} rows
 * @param {number} [limit=15]
 */
export function topFailingComponents(rows, limit = 15) {
  const byComp = {};
  rows.forEach((d) => {
    if (!byComp[d.comp]) {
      byComp[d.comp] = { count: 0, defectCounts: {}, models: new Set(), sides: new Set() };
    }
    const c = byComp[d.comp];
    c.count++;
    c.defectCounts[d.defect] = (c.defectCounts[d.defect] || 0) + 1;
    c.models.add(d.model);
    c.sides.add(d.side);
  });

  return Object.entries(byComp)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([comp, v], i) => {
      const [topDefect, topDefectCount] = Object.entries(v.defectCounts).sort((a, b) => b[1] - a[1])[0];
      return {
        rank: i + 1,
        comp,
        count: v.count,
        topDefect,
        topDefectCount,
        models: [...v.models],
        sides: [...v.sides],
      };
    });
}
