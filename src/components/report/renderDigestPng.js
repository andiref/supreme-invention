// ============================================
// renderDigestPng.js — the multi-customer "email digest" PNG generator,
// ported from the pre-React app's js/yield.js (drawDigestCard,
// drawDigestMiniChart, generateDigestReport). One compact card per
// customer — identity/KPIs, ranked Top-3 defects with proportional bars,
// mini Yield/DPPM trend charts — stacked into a single PNG sized for one
// email. Browser/canvas only — intentionally NOT in src/brain (kept
// DOM-free), mirrored next to ReportSnapshot.jsx instead.
// ============================================

import { YIELD_TARGET, DPPM_LIMIT, CHART_COLORS, computeCustomerReportData } from '../../brain/index.js';

const fmt = (n) => Number(n).toLocaleString();
const DIGEST_COLORS = CHART_COLORS; // one per customer, cycling if there are more customers than colors
const DIGEST_BAR_COLORS = ['#dc2626', '#f59e0b', '#eab308']; // rank 1/2/3 — red, orange, yellow

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawDigestMiniChart(ctx, ox, oy, ow, oh, vals, labels, target, targColor, isYield, title) {
  const PL = 44; const PR = 8; const PT = 26; const PB = 16;
  const pw = ow - PL - PR;
  const ph = oh - PT - PB;
  const have = vals.filter((v) => v != null);
  if (!have.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.03)'; rrect(ctx, ox, oy, ow, oh, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; rrect(ctx, ox, oy, ow, oh, 5); ctx.stroke();
    ctx.fillStyle = '#333333'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'left'; ctx.fillText(title, ox + 8, oy + 11);
    ctx.fillStyle = '#999999'; ctx.font = '9px Arial'; ctx.textAlign = 'center'; ctx.fillText('No data', ox + ow / 2, oy + oh / 2 + 3);
    return;
  }
  const allV = [...have, target || 0];
  // yield can never exceed 100%, so cap the axis there instead of auto-scaling to just above the data
  const maxV = isYield ? 100 : Math.max(...allV) * 1.1;
  const minV = Math.min(...allV) * (isYield ? 0.997 : 0);
  const xp = (i) => ox + PL + (labels.length < 2 ? pw / 2 : (i / (labels.length - 1)) * pw);
  const yp = (v) => oy + PT + ph - ((v - minV) / (maxV - minV || 1)) * ph;

  ctx.fillStyle = 'rgba(0,0,0,0.03)'; rrect(ctx, ox, oy, ow, oh, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; rrect(ctx, ox, oy, ow, oh, 5); ctx.stroke();

  // top/bottom gridlines only — a 5-line grid is too cluttered at this size
  [0, 1].forEach((i) => {
    const gy = oy + PT + ph * (1 - i);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(ox + PL, gy); ctx.lineTo(ox + PL + pw, gy); ctx.stroke();
    const v = minV + (maxV - minV) * i;
    ctx.fillStyle = '#666666'; ctx.font = '7px Arial'; ctx.textAlign = 'right';
    ctx.fillText(isYield ? `${v.toFixed(2)}%` : Math.round(v).toLocaleString(), ox + PL - 4, gy + 3);
  });

  if (target >= minV && target <= maxV) {
    const ty = yp(target);
    ctx.strokeStyle = targColor; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(ox + PL, ty); ctx.lineTo(ox + PL + pw, ty); ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.8; ctx.beginPath();
  vals.forEach((v, i) => {
    if (v == null) return;
    if (i === 0) ctx.moveTo(xp(i), yp(v)); else ctx.lineTo(xp(i), yp(v));
  });
  ctx.stroke();
  vals.forEach((v, i) => {
    if (v == null) return;
    ctx.beginPath(); ctx.arc(xp(i), yp(v), 2.5, 0, Math.PI * 2); ctx.fillStyle = '#000000'; ctx.fill();
  });

  // only label the most recent point, to stay legible at this size
  const lastIdx = vals.length - 1;
  if (vals[lastIdx] != null) {
    ctx.fillStyle = '#000000'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
    ctx.fillText(isYield ? `${vals[lastIdx].toFixed(2)}%` : Math.round(vals[lastIdx]).toLocaleString(), xp(lastIdx), yp(vals[lastIdx]) - 6);
  }

  ctx.fillStyle = '#666666'; ctx.font = '7px Arial'; ctx.textAlign = 'center';
  const showEvery = labels.length > 6 ? Math.ceil(labels.length / 6) : 1;
  labels.forEach((l, i) => { if (i % showEvery === 0 || i === labels.length - 1) ctx.fillText(l, xp(i), oy + PT + ph + 11); });

  ctx.fillStyle = '#333333'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'left';
  ctx.fillText(title, ox + 8, oy + 11);

  // legend, top-right of the same row as the title: "●— Yield   ---99.5% target"
  const metricLabel = isYield ? 'Yield' : 'DPPM';
  const targLabel = isYield ? `${YIELD_TARGET}% target` : `${fmt(DPPM_LIMIT)} limit`;
  const legY = oy + 11;
  ctx.font = 'bold 8px Arial';
  const targW = ctx.measureText(targLabel).width;
  const metW = ctx.measureText(metricLabel).width;
  let lx = ox + ow - 8;
  ctx.textAlign = 'right'; ctx.fillStyle = '#333333';
  ctx.fillText(targLabel, lx, legY);
  lx -= targW + 6;
  ctx.strokeStyle = targColor; ctx.lineWidth = 1.3; ctx.setLineDash([3, 2]);
  ctx.beginPath(); ctx.moveTo(lx - 14, legY - 3); ctx.lineTo(lx, legY - 3); ctx.stroke();
  ctx.setLineDash([]);
  lx -= 14 + 10;
  ctx.fillStyle = '#333333'; ctx.fillText(metricLabel, lx, legY);
  lx -= metW + 8;
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(lx - 16, legY - 3); ctx.lineTo(lx, legY - 3); ctx.stroke();
  ctx.beginPath(); ctx.arc(lx - 8, legY - 3, 2, 0, Math.PI * 2); ctx.fillStyle = '#000000'; ctx.fill();
  ctx.textAlign = 'left';
}

function drawDigestCard(ctx, x0, y0, w, h, custName, rd, color, weekBadge) {
  // Headline KPIs + top-3 reflect the single latest week of the report;
  // the mini trend charts always span the last REPORT_MAX_WEEKS weeks —
  // decoupled from the FROM/TO range picker on the tab.
  const {
    latestYieldOverall: oy, latestDppm: od, latestTotalInsp: latestTp,
    t3, topOf, trendLabels: labels, trendYieldSeries: yVals, trendDppmSeries: dVals,
  } = rd;
  // guards against showing a misleading 0%/0 when this customer simply has no records for the latest week
  const hasLatest = latestTp > 0;

  // card border + left accent bar (customer color, for fast visual scanning down a long multi-customer digest)
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; rrect(ctx, x0, y0, w, h, 6); ctx.stroke();
  ctx.fillStyle = color; rrect(ctx, x0, y0, 5, h, 2); ctx.fill();

  const col1X = x0 + 24; const col1W = 185;
  const col2X = col1X + col1W + 24; const col2W = 230;
  const col3X = col2X + col2W + 24; const col3W = (x0 + w) - col3X - 8;

  // ---- Column 1: identity + the two headline KPIs ----
  ctx.textAlign = 'left';
  ctx.fillStyle = '#000000'; ctx.font = 'bold 18px Arial';
  ctx.fillText(custName.length > 16 ? `${custName.slice(0, 15)}…` : custName, col1X, y0 + 26);
  ctx.fillStyle = '#666666'; ctx.font = 'bold 10px Arial'; ctx.fillText(weekBadge, col1X, y0 + 42);

  ctx.fillStyle = '#888888'; ctx.font = 'bold 9px Arial'; ctx.fillText('OVERALL YIELD', col1X, y0 + 106);
  ctx.fillStyle = '#000000'; ctx.font = 'bold 21px Arial'; ctx.fillText(hasLatest ? `${oy.toFixed(2)}%` : '—', col1X, y0 + 128);
  ctx.fillStyle = '#888888'; ctx.font = '9px Arial'; ctx.fillText(hasLatest ? `Target: ${YIELD_TARGET}%` : 'No data this week', col1X, y0 + 142);

  ctx.fillStyle = '#888888'; ctx.font = 'bold 9px Arial'; ctx.fillText('DPPM', col1X, y0 + 172);
  ctx.fillStyle = '#000000'; ctx.font = 'bold 21px Arial'; ctx.fillText(hasLatest ? Math.round(od).toLocaleString() : '—', col1X, y0 + 194);
  ctx.fillStyle = '#888888'; ctx.font = '9px Arial'; ctx.fillText(hasLatest ? `Limit: ${fmt(DPPM_LIMIT)}` : '', col1X, y0 + 208);

  // ---- Column 2: Top 3 defects — proportional bars so the size of #1 relative to #2/#3 is visible at a glance ----
  ctx.fillStyle = '#888888'; ctx.font = 'bold 9px Arial'; ctx.fillText('TOP 3 DEFECTS', col2X, y0 + 20);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(col2X, y0 + 26); ctx.lineTo(col2X + col2W, y0 + 26); ctx.stroke();

  if (!t3.length) {
    ctx.fillStyle = '#999999'; ctx.font = '10px Arial'; ctx.textAlign = 'left';
    ctx.fillText('No defects recorded this period.', col2X, y0 + 50);
  } else {
    const maxCount = t3[0][1];
    let rowY = y0 + 46;
    t3.forEach(([def, cnt], i) => {
      ctx.fillStyle = '#000000'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${def.length > 20 ? `${def.slice(0, 19)}…` : def}`, col2X, rowY);
      ctx.textAlign = 'right'; ctx.fillText(String(cnt), col2X + col2W, rowY);

      const barY = rowY + 6; const barH = 8;
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; rrect(ctx, col2X, barY, col2W, barH, 3); ctx.fill();
      const bw = Math.max(4, col2W * (cnt / maxCount));
      ctx.fillStyle = DIGEST_BAR_COLORS[i] || '#999999'; rrect(ctx, col2X, barY, bw, barH, 3); ctx.fill();

      // top contributing model/component, bold and on their own lines
      const contribValX = col2X + 94;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#555555'; ctx.font = 'bold 10px Arial'; ctx.fillText('TOP Contr. Model:', col2X, barY + 26);
      ctx.fillStyle = '#000000'; ctx.font = 'bold 10px Arial'; ctx.fillText(topOf(def, 'model', 18), contribValX, barY + 26);
      ctx.fillStyle = '#555555'; ctx.font = 'bold 10px Arial'; ctx.fillText('TOP Contr. Comp:', col2X, barY + 40);
      ctx.fillStyle = '#000000'; ctx.font = 'bold 10px Arial'; ctx.fillText(topOf(def, 'comp', 18), contribValX, barY + 40);
      rowY += 64;
    });
  }

  // ---- Column 3: mini Yield + DPPM trend charts ----
  const mcH = (h - 24) / 2 - 4;
  drawDigestMiniChart(ctx, col3X, y0 + 8, col3W, mcH, yVals, labels, YIELD_TARGET, '#16a34a', true, 'Yield Trend');
  drawDigestMiniChart(ctx, col3X, y0 + 8 + mcH + 8, col3W, mcH, dVals, labels, DPPM_LIMIT, '#dc2626', false, 'DPPM Trend');
}

/**
 * Builds the digest canvas for the given customers, or returns null if
 * none of them have data in the selected week range.
 *
 * @param {string[]} customers
 * @param {{from:string,to:string}} range
 * @param {ReturnType<import('../../brain/metrics.js').calcMetrics>} metrics
 * @param {object[]} defectRows
 */
export function buildDigestCanvas(customers, range, metrics, defectRows) {
  const cards = [];
  customers.forEach((cust) => {
    const rd = computeCustomerReportData(cust, range, metrics, defectRows);
    if (rd) cards.push({ cust, rd });
  });
  if (!cards.length) return null;

  const weekBadge = range.to;

  const W = 1100; const PAD = 32;
  const CARD_H = 300; const CARD_GAP = 16;
  const HDR = 64; const FTR = 44;
  const TOTAL = HDR + cards.length * (CARD_H + CARD_GAP) - CARD_GAP + FTR + PAD * 2;

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = TOTAL;
  const ctx = cv.getContext('2d');

  // header
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, HDR); ctx.lineTo(W, HDR); ctx.stroke();
  ctx.fillStyle = '#000000'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'left';
  ctx.fillText('SMT WEEKLY YIELD & DPPM TREND', PAD, 32);
  ctx.fillStyle = '#444444'; ctx.font = 'bold 12px Arial';
  ctx.fillText(`Week: ${weekBadge}  ·  Trend: last ${cards.length ? cards[0].rd.trendLabels.length : 0} weeks   |   ${cards.length} customer${cards.length === 1 ? '' : 's'}`, PAD, 53);

  let y = HDR + PAD;
  cards.forEach(({ cust, rd }, idx) => {
    const color = DIGEST_COLORS[idx % DIGEST_COLORS.length];
    drawDigestCard(ctx, PAD, y, W - PAD * 2, CARD_H, cust, rd, color, weekBadge);
    y += CARD_H + CARD_GAP;
  });

  // footer
  y = TOTAL - FTR + 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  ctx.fillStyle = '#444444'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
  ctx.fillText('SMT Command Center  ·  Confidential', W / 2, y + 20);

  return cv;
}

/**
 * Builds the digest and triggers a PNG download. Returns false (no
 * download triggered) if none of the selected customers have data in range.
 */
export function exportDigestPng(customers, range, metrics, defectRows) {
  const cv = buildDigestCanvas(customers, range, metrics, defectRows);
  if (!cv) return false;
  const weekLabel = range.from === range.to ? range.from : `${range.from} – ${range.to}`;
  const link = document.createElement('a');
  link.download = `SMT_Digest_${weekLabel.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
  link.href = cv.toDataURL('image/png');
  link.click();
  return true;
}
