// ============================================
// equipmentLogic.js — equipment/part follow-up tracker helpers
// ============================================

import { EQUIPMENT_STATUSES } from './constants.js';

const STATUS_COLORS = {
  Requested: '#64748b', Ordered: '#3b82f6', 'In Transit': '#f59e0b',
  Received: '#a78bfa', Installed: '#22c55e', Cancelled: '#ef4444',
};
const PRIORITY_COLORS = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' };
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
const DONE_STATUSES = ['Installed', 'Cancelled'];

export function equipmentStatusColor(status) {
  return STATUS_COLORS[status] || '#64748b';
}

export function equipmentPriorityColor(priority) {
  return PRIORITY_COLORS[priority] || '#f59e0b';
}

export function isEquipmentDone(status) {
  return DONE_STATUSES.includes(status);
}

/**
 * Sorts equipment entries: active items first (High priority, then
 * oldest-first so nothing gets forgotten), Installed/Cancelled sink to
 * the bottom (most recently updated first).
 */
export function sortEquipment(items) {
  return [...items].sort((a, b) => {
    const aDone = isEquipmentDone(a.status);
    const bDone = isEquipmentDone(b.status);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (aDone && bDone) return (b.updated || 0) - (a.updated || 0);
    const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (pr !== 0) return pr;
    return (a.created || 0) - (b.created || 0);
  });
}

export { EQUIPMENT_STATUSES };
