// ============================================
// customerGroups.js — treat several imported customer names as one customer
// (see CUSTOMER_GROUPS in constants.js). Pure functions, no DOM.
// ============================================

import { CUSTOMER_GROUPS } from './constants.js';

/** The group a customer belongs to (e.g. 'CASCO-2' -> 'CASCO'), or the customer itself if it isn't grouped. */
export function customerGroupOf(customer) {
  const name = String(customer ?? '').trim();
  const group = CUSTOMER_GROUPS.find((g) => g.match.test(name));
  return group ? group.name : customer;
}

/**
 * Buckets customer names by group, in first-seen order.
 * @param {string[]} customers
 * @returns {{name:string, members:string[]}[]}  ungrouped customers come back as a group of one
 */
export function groupCustomers(customers) {
  const byGroup = new Map();
  customers.forEach((c) => {
    const g = customerGroupOf(c);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(c);
  });
  return [...byGroup.entries()].map(([name, members]) => ({ name, members }));
}

/** Sorted, de-duplicated group names — what a monthly-KPI customer picker should list. */
export function distinctCustomerGroups(customers) {
  return groupCustomers(customers).map((g) => g.name).sort();
}

/** Only the groups that actually merge more than one customer name. */
export function combinedCustomerGroups(customers) {
  return groupCustomers(customers).filter((g) => g.members.length > 1);
}
