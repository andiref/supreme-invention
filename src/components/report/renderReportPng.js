// ============================================
// renderReportPng.js — the original hand-drawn Canvas report generator,
// ported from the pre-React app's js/yield.js (generateReport()). The
// React rebuild replaced this with an html2canvas DOM screenshot, which
// lost the print-ready layout (KPI boxes, dual trend charts, ranked
// Top-3 defect cards). This restores that exact rendering, wired to the
// already-ported computeCustomerReportData() output instead of re-reading
// the DOM. Browser/canvas only — intentionally NOT in src/brain (which is
// kept DOM-free), mirrored next to ReportSnapshot.jsx instead.
// ============================================

import { YIELD_TARGET, DPPM_LIMIT } from '../../brain/index.js';

const fmt = (n) => Number(n).toLocaleString();

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

/**
 * Draws the full report onto a fresh canvas and returns it (does not
 * download it — see exportReportPng below for that).
 *
 * @param {string} customer — 'ALL' or a customer name
 * @param {{from:string,to:string}} range
 * @param {ReturnType<import('../../brain/reportData.js').computeCustomerReportData>} data
 * @param {string} author
 */
export function buildReportCanvas(customer, range, data, author) {
  const {
    totalInsp: tp, totalFailed: tf, failedTOP: ft, failedBOT: fb, inspTOP: it, inspBOT: ib,
    yieldOverall: oy, yieldTOP: ot, yieldBOT: ob, dppm: od,
    labels, yieldSeries: yVals, dppmSeries: dVals, t3, topOf, lw, filtRawCount,
  } = data;

  const weekLabel = range.from === range.to ? range.from : `${range.from} – ${range.to}`;
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const custLabel = customer === 'ALL' ? 'All Customers' : customer;

  // Canvas layout
  const W = 1100;
  const PAD = 32;
  const HDR = 90;
  const KPI = 120;
  const CHART = 260;
  const TOP3 = t3.length ? 195 : 0;

  const TOTAL = HDR + KPI + CHART * 2 + TOP3 + 44 + PAD * 6;

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = TOTAL;
  const ctx = cv.getContext('2d');

  // No background fill — canvas stays transparent so the exported PNG
  // drops cleanly onto white paper, a colored letterhead, or a slide,
  // instead of carrying its own fixed backdrop color.

  // header
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, HDR); ctx.lineTo(W, HDR); ctx.stroke();
  ctx.fillStyle = '#000000'; ctx.font = 'bold 24px Courier New'; ctx.textAlign = 'left';
  ctx.fillText('SMT YIELD & DPPM TREND REPORT', PAD, 38);
  ctx.fillStyle = '#333333'; ctx.font = 'bold 16px Courier New';
  ctx.fillText(`Customer: ${custLabel}`, PAD, 61);
  ctx.fillStyle = '#444444'; ctx.font = 'bold 13px Courier New';
  ctx.fillText((range.from === range.to ? 'Week: ' : 'Weeks: ') + weekLabel, PAD, 80);
  ctx.fillStyle = '#444444'; ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'right';
  ctx.fillText(`Yield target ≥${YIELD_TARGET}%  |  DPPM limit ≤${fmt(DPPM_LIMIT)}`, W - PAD, 80);
  if (author) {
    ctx.fillStyle = '#666666'; ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'right';
    ctx.fillText(`Prepared by ${author}  ·  ${now}`, W - PAD, 96);
  }

  let y = HDR + PAD;

  // KPI boxes
  const kpis = [
    { l: 'YIELD OVERALL', v: `${oy.toFixed(3)}%`, ok: oy >= YIELD_TARGET, s: `Failed:${tf}/${fmt(tp)}` },
    { l: 'YIELD TOP', v: ot != null ? `${ot.toFixed(3)}%` : '—', ok: ot != null && ot >= YIELD_TARGET, s: `Fail:${ft}/${fmt(it)}` },
    { l: 'YIELD BOT', v: ob != null ? `${ob.toFixed(3)}%` : '—', ok: ob != null && ob >= YIELD_TARGET, s: `Fail:${fb}/${fmt(ib)}` },
    { l: 'DPPM', v: Math.round(od).toLocaleString(), ok: od <= DPPM_LIMIT, s: `Limit ≤${fmt(DPPM_LIMIT)}` },
  ];
  const kw = Math.floor((W - PAD * 2 - 12 * 3) / 4);
  kpis.forEach((k, i) => {
    const kx = PAD + i * (kw + 12);
    // box — grayscale; pass/fail is conveyed by the ✓/✗ symbol below, not color
    ctx.fillStyle = 'rgba(0,0,0,0.04)'; rrect(ctx, kx, y, kw, KPI - 10, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; rrect(ctx, kx, y, kw, KPI - 10, 8); ctx.stroke();
    ctx.fillStyle = '#444444'; ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center';
    ctx.fillText(k.l, kx + kw / 2, y + 22);
    ctx.fillStyle = '#000000'; ctx.font = 'bold 32px Courier New';
    ctx.fillText(k.v, kx + kw / 2, y + 60);
    ctx.fillStyle = '#000000'; ctx.font = 'bold 13px Courier New';
    ctx.fillText(k.ok ? '✓ PASS' : '✗ FAIL', kx + kw / 2, y + 82);
    ctx.fillStyle = '#444444'; ctx.font = 'bold 11px Courier New';
    ctx.fillText(k.s, kx + kw / 2, y + 101);
  });
  y += KPI + PAD;

  // Chart helper — draw directly on ctx
  function drawChartCtx(ox, oy2, vals, target, targLabel, isYield, lineColor, targColor) {
    const PL = 78; const PR = 20; const PT = 32; const PB = 54;
    const pw = W / 2 - PAD * 1.5 - PL - PR;
    const ph = CHART - PT - PB;
    const allV = [...vals.filter((v) => v != null), target || 0];
    const maxV = Math.max(...allV) * (isYield ? 1.003 : 1.1);
    const minV = Math.min(...allV) * (isYield ? 0.997 : 0);
    const xp = (i) => ox + PL + (labels.length < 2 ? pw / 2 : (i / (labels.length - 1)) * pw);
    const yp = (v) => oy2 + PT + ph - ((v - minV) / (maxV - minV || 1)) * ph;

    // chart bg
    ctx.fillStyle = 'rgba(0,0,0,0.03)'; rrect(ctx, ox, oy2, W / 2 - PAD * 1.5, CHART, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; rrect(ctx, ox, oy2, W / 2 - PAD * 1.5, CHART, 6); ctx.stroke();

    // grid
    for (let i = 0; i <= 5; i += 1) {
      const gy = oy2 + PT + ph * (1 - i / 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(ox + PL, gy); ctx.lineTo(ox + PL + pw, gy); ctx.stroke();
      ctx.fillStyle = '#444444'; ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'right';
      const v = minV + (maxV - minV) * (i / 5);
      ctx.fillText(isYield ? `${v.toFixed(2)}%` : Math.round(v).toLocaleString(), ox + PL - 6, gy + 4);
    }

    // target — the one line that stays colored: green for the yield
    // target, red for the DPPM upper limit (set by caller)
    if (target >= minV && target <= maxV) {
      const ty = yp(target);
      ctx.strokeStyle = targColor; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(ox + PL, ty); ctx.lineTo(ox + PL + pw, ty); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = targColor; ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'left';
      ctx.fillText(targLabel, ox + PL + 4, ty - 5);
    }
    ctx.setLineDash([]);

    // line — actual data trend stays black/grayscale
    ctx.strokeStyle = lineColor; ctx.lineWidth = 2.5; ctx.beginPath();
    vals.forEach((v, i) => {
      if (v == null) return;
      if (i === 0) ctx.moveTo(xp(i), yp(v)); else ctx.lineTo(xp(i), yp(v));
    });
    ctx.stroke();

    // dots + labels
    vals.forEach((v, i) => {
      if (v == null) return;
      ctx.beginPath(); ctx.arc(xp(i), yp(v), 5, 0, Math.PI * 2); ctx.fillStyle = lineColor; ctx.fill();
      ctx.fillStyle = '#000000'; ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center';
      const lbl = isYield ? `${v.toFixed(2)}%` : Math.round(v).toLocaleString();
      ctx.fillText(lbl, xp(i), yp(v) - 13);
      ctx.fillStyle = '#444444'; ctx.font = 'bold 11px Courier New';
      ctx.fillText(labels[i], xp(i), oy2 + PT + ph + 18);
    });

    // legend
    const ly = oy2 + CHART - 13;
    ctx.strokeStyle = lineColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ox + PL, ly); ctx.lineTo(ox + PL + 22, ly); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox + PL + 11, ly, 4, 0, Math.PI * 2); ctx.fillStyle = lineColor; ctx.fill();
    ctx.fillStyle = '#333333'; ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'left';
    ctx.fillText(isYield ? 'Yield' : 'DPPM', ox + PL + 27, ly + 4);
    ctx.strokeStyle = targColor; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(ox + PL + 95, ly); ctx.lineTo(ox + PL + 117, ly); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = '#333333'; ctx.fillText(targLabel, ox + PL + 122, ly + 4);
  }

  // Yield chart (left) — data line black, target line green
  drawChartCtx(PAD, y, yVals, YIELD_TARGET, `${YIELD_TARGET}% target`, true, '#000000', '#16a34a');
  ctx.fillStyle = '#000000'; ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'left';
  ctx.fillText(`📈 ${custLabel} — Yield`, PAD + 16, y + 20);

  // DPPM chart (right) — data line black, upper limit line red
  const rx = W / 2 + PAD / 2;
  drawChartCtx(rx, y, dVals, DPPM_LIMIT, `${fmt(DPPM_LIMIT)} limit`, false, '#000000', '#dc2626');
  ctx.fillStyle = '#000000'; ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'left';
  ctx.fillText(`📈 ${custLabel} — DPPM`, rx + 16, y + 20);

  y += CHART + PAD;

  // Top 3 strip
  if (t3.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.03)'; rrect(ctx, PAD, y, W - PAD * 2, TOP3, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; rrect(ctx, PAD, y, W - PAD * 2, TOP3, 8); ctx.stroke();
    ctx.fillStyle = '#000000'; ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'left';
    ctx.fillText(`🔴 TOP 3 DEFECTS — ${lw} — ${custLabel}`, PAD + 14, y + 22);
    const sw2 = (W - PAD * 2 - 28) / 3;
    // rank conveyed by shade (darkest = #1) instead of color, so it still reads on any background
    const rankShade = ['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.45)'];
    const rankFill = ['rgba(0,0,0,0.07)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.03)'];
    t3.forEach(([def, cnt], i) => {
      const bx = PAD + 14 + i * (sw2 + 10);
      const boxY = y + 30; const boxH = TOP3 - 42;
      ctx.fillStyle = rankFill[i]; rrect(ctx, bx, boxY, sw2, boxH, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; rrect(ctx, bx, boxY, sw2, boxH, 5); ctx.stroke();

      // rank + defect name
      ctx.fillStyle = rankShade[i]; ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'center';
      ctx.fillText(`#${i + 1}  ${def.length > 24 ? `${def.slice(0, 23)}…` : def}`, bx + sw2 / 2, boxY + 19);
      ctx.fillStyle = rankShade[i]; ctx.font = 'bold 19px Courier New';
      ctx.fillText(`${cnt} defects`, bx + sw2 / 2, boxY + 42);

      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx + 16, boxY + 53); ctx.lineTo(bx + sw2 - 16, boxY + 53); ctx.stroke();

      // most contributing model
      ctx.fillStyle = '#666666'; ctx.font = 'bold 10px Courier New'; ctx.textAlign = 'center';
      ctx.fillText('MOST CONTRIBUTING MODEL', bx + sw2 / 2, boxY + 71);
      ctx.fillStyle = '#000000'; ctx.font = 'bold 16px Courier New';
      ctx.fillText(topOf(def, 'model', 20), bx + sw2 / 2, boxY + 92);

      // most contributing component
      ctx.fillStyle = '#666666'; ctx.font = 'bold 10px Courier New';
      ctx.fillText('MOST CONTRIBUTING COMPONENT', bx + sw2 / 2, boxY + 112);
      ctx.fillStyle = '#000000'; ctx.font = 'bold 16px Courier New';
      ctx.fillText(topOf(def, 'comp', 20), bx + sw2 / 2, boxY + 133);
    });
    y += TOP3 + PAD;
  }

  // Footer
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  ctx.fillStyle = '#444444'; ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center';
  ctx.fillText(`SMT Command Center  ·  ${now}  ·  Confidential`, W / 2, y + 18);
  ctx.fillStyle = '#000000'; ctx.font = 'bold 11px Courier New';
  ctx.fillText(`Yield ≥${YIELD_TARGET}%  |  DPPM ≤${fmt(DPPM_LIMIT)}  |  ${filtRawCount.toLocaleString()} defect records`, W / 2, y + 36);

  return cv;
}

/** Builds the report canvas and triggers a PNG download, exactly like the original app. */
export function exportReportPng(customer, range, data, author) {
  const custLabel = customer === 'ALL' ? 'All-Customers' : customer;
  const weekLabel = range.from === range.to ? range.from : `${range.from} – ${range.to}`;
  const cv = buildReportCanvas(customer, range, data, author);
  const link = document.createElement('a');
  link.download = `SMT_${custLabel.replace(/[^a-zA-Z0-9]/g, '-')}_${weekLabel.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
  link.href = cv.toDataURL('image/png');
  link.click();
}
