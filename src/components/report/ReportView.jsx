import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import {
  calcMetrics, distinctWeeks, distinctCustomers, buildWeekSelectionRange, defaultReportWeeks, combinedCustomerGroups, monthlySummary, formatMonthLabel, computeCustomerReportData, buildDigestData, buildCapaExportRows, REPORT_MAX_WEEKS,
} from '../../brain/index.js';
import { Card } from '../common/Kpi.jsx';
import FilterField from '../common/FilterField.jsx';
import ExcelFilterDropdown from '../common/ExcelFilterDropdown.jsx';
import DigestSnapshot from '../report/DigestSnapshot.jsx';
import CapaTracker from '../capa/CapaTracker.jsx';

function weekLabel(w) {
  const m = String(w).match(/W(\d+)$/);
  return m ? `WW${m[1]}` : w;
}

const SCOPE_OPTIONS = [
  { value: 'latest', label: 'Last selected week' },
  { value: 'rollup', label: 'All selected weeks (roll-up)' },
];

export default function ReportView({ defectRows, prodVolRows, capaRecords, showToast, showConfirm, onDataChanged }) {
  const metrics = useMemo(() => calcMetrics(defectRows, prodVolRows), [defectRows, prodVolRows]);
  const allWeeks = useMemo(() => distinctWeeks(defectRows), [defectRows]);
  const customers = useMemo(() => distinctCustomers(defectRows), [defectRows]);

  // Digest weeks: any weeks the user ticks (null = untouched, which means
  // "the latest 11 weeks" and keeps following new imports). `scope` decides
  // whether the headline KPIs + Top 3 defects describe the last selected week
  // or accumulate over every selected week (monthly-KPI-style roll-up).
  const [weekPick, setWeekPick] = useState(null);
  const [scope, setScope] = useState('latest');
  // Customer for the CAPA tracker below ('' = first customer).
  const [trackerCustomerPick, setTrackerCustomerPick] = useState('');
  const [digestExporting, setDigestExporting] = useState(false);
  const digestRef = useRef(null);

  // Which customers get included in the digest. New customers default to
  // checked (so a freshly-imported account shows up without extra clicks);
  // a customer someone explicitly unchecked stays unchecked even as new
  // data comes in for other accounts.
  const knownCustomersRef = useRef(new Set());
  const [selectedCustomers, setSelectedCustomers] = useState(new Set());
  useEffect(() => {
    setSelectedCustomers((prev) => {
      let changed = false;
      const next = new Set(prev);
      customers.forEach((c) => {
        if (!knownCustomersRef.current.has(c)) {
          knownCustomersRef.current.add(c);
          next.add(c);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [customers]);

  // Same "new customer defaults to checked" pattern as the digest's
  // selection, but tracked independently — the two exports often go to
  // different audiences, so selecting for one shouldn't affect the other.
  const knownCapaCustomersRef = useRef(new Set());
  const [selectedCapaCustomers, setSelectedCapaCustomers] = useState(new Set());
  useEffect(() => {
    setSelectedCapaCustomers((prev) => {
      let changed = false;
      const next = new Set(prev);
      customers.forEach((c) => {
        if (!knownCapaCustomersRef.current.has(c)) {
          knownCapaCustomersRef.current.add(c);
          next.add(c);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [customers]);

  const [capaIncludeClosed, setCapaIncludeClosed] = useState(false);
  const [capaExporting, setCapaExporting] = useState(false);

  const selectedWeeks = useMemo(() => {
    const picked = weekPick ? allWeeks.filter((w) => weekPick.has(w)) : [];
    return new Set(picked.length ? picked : defaultReportWeeks(allWeeks));
  }, [allWeeks, weekPick]);
  const range = useMemo(
    () => buildWeekSelectionRange(allWeeks, selectedWeeks, { rollup: scope === 'rollup' }),
    [allWeeks, selectedWeeks, scope],
  );
  // CAPA chains are always judged on a single week (the last selected one),
  // never on a multi-week roll-up.
  const capaRange = useMemo(() => (range ? { ...range, rollup: false } : null), [range]);

  // Newest week first in the picker — recent weeks are what you usually want.
  const weeksNewestFirst = useMemo(() => [...allWeeks].reverse(), [allWeeks]);

  // Months present in the data, for the "pick a month" shortcut. Uses the
  // same week→month rule as the Yield tab's monthly KPI roll-up.
  const monthOptions = useMemo(
    () => monthlySummary(metrics).map((m) => ({ value: m.month, label: formatMonthLabel(m.month), weeks: m.weeks })),
    [metrics],
  );
  function handlePickMonth(monthKey) {
    const m = monthOptions.find((o) => o.value === monthKey);
    if (!m) return;
    setWeekPick(new Set(m.weeks));
    setScope('rollup');
  }

  const trackerCustomer = customers.includes(trackerCustomerPick) ? trackerCustomerPick : (customers[0] || '');
  const reportData = useMemo(() => {
    if (!capaRange || !trackerCustomer) return null;
    return computeCustomerReportData(trackerCustomer, capaRange, metrics, defectRows);
  }, [trackerCustomer, capaRange, metrics, defectRows]);

  const digestCustomers = useMemo(
    () => customers.filter((c) => selectedCustomers.has(c)),
    [customers, selectedCustomers],
  );
  const digestSections = useMemo(() => {
    if (!range) return [];
    return buildDigestData(digestCustomers, range, metrics, defectRows);
  }, [range, digestCustomers, metrics, defectRows]);

  async function exportNode(node, filename, setBusy) {
    if (!node) return;
    setBusy(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      // Wait for fonts/charts to finish painting so the PNG is deterministic.
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const width = node.scrollWidth;
      const height = node.scrollHeight;
      // Only the export should lose its page background (so the PNG
      // adapts to whatever it's pasted onto in an email) — the on-screen
      // preview keeps its background, so swap it out just for the capture.
      const prevBackground = node.style.background;
      node.style.background = 'transparent';
      let canvas;
      try {
        canvas = await html2canvas(node, {
          scale: 2,
          backgroundColor: null,
          useCORS: true,
          logging: false,
          width,
          height,
          windowWidth: width,
          windowHeight: height,
          scrollX: 0,
          scrollY: 0,
        });
      } finally {
        node.style.background = prevBackground;
      }
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('✓ PNG downloaded');
    } catch (err) {
      showToast(`Export failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const handleExportDigestPng = () => exportNode(digestRef.current, range.rollup && range.weeks.length > 1 ? `SMT_Digest_${range.from}_to_${range.to}.png` : `SMT_Digest_${range.to}.png`, setDigestExporting);

  const capaExportCustomers = useMemo(
    () => customers.filter((c) => selectedCapaCustomers.has(c)),
    [customers, selectedCapaCustomers],
  );

  const CAPA_EXPORT_HEADERS = [
    'Customer', 'Status', 'Rank (this wk)', 'Defect', 'Model', 'Component',
    'Count (this wk)', 'Weeks Tracked',
    'Why 1', 'Why 2', 'Why 3', 'Why 4', 'Why 5 / Root Cause',
    'Corrective Action', 'Due Date', 'Owner (PIC)',
    'Action Week', 'Before Avg/wk', 'After Avg/wk', 'Trend % Change', 'Effectiveness',
  ];
  const CAPA_EXPORT_COL_WIDTHS = [11, 12, 8, 16, 14, 10, 10, 9, 22, 22, 24, 24, 24, 30, 11, 12, 10, 11, 11, 10, 26];

  async function handleExportCapaXlsx() {
    if (!capaExportCustomers.length || !capaRange) return;
    setCapaExporting(true);
    try {
      const rows = buildCapaExportRows(capaExportCustomers, capaRange, metrics, defectRows, capaRecords, capaIncludeClosed);
      if (!rows.length) {
        showToast('No CAPA chains to export for the selected customers.');
        return;
      }
      const XLSX = await import('xlsx');
      const aoa = [CAPA_EXPORT_HEADERS, ...rows.map((r) => [
        r.customer, r.status, r.rank, r.defect, r.model, r.comp, r.count, r.weeksTracked,
        r.why1, r.why2, r.why3, r.why4, r.rootCause, r.correctiveAction, r.dueDate, r.pic,
        r.actionWeek, r.beforeAvg, r.afterAvg, r.deltaPct, r.effectiveness,
      ])];
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      sheet['!cols'] = CAPA_EXPORT_COL_WIDTHS.map((wch) => ({ wch }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'CAPA Export');
      XLSX.writeFile(wb, `CAPA_Export_${capaRange.to}.xlsx`);
      showToast('✓ CAPA Excel downloaded');
    } catch (err) {
      showToast(`Export failed: ${err.message}`);
    } finally {
      setCapaExporting(false);
    }
  }

  if (!allWeeks.length) {
    return (
      <div id="yc-root">
        <Card><div style={{ fontSize: 12, color: 'var(--yc-muted)' }}>Import Defect Data on the Yield tab first — reports are built from that.</div></Card>
      </div>
    );
  }

  return (
    <div id="yc-root">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="ct" style={{ marginBottom: 2 }}>🗂 WEEKLY DIGEST</div>
            <div style={{ fontSize: 10, color: 'var(--yc-muted)' }}>
              Export as one image to attach to the weekly email — every selected customer's KPI + trend.
              {' '}{range.rollup && range.weeks.length > 1
                ? `Roll-up of ${range.weeks.length} selected weeks (${weekLabel(range.from)} – ${weekLabel(range.to)}).`
                : `Week ${weekLabel(range.to)}.`}
              {range.rollup && combinedCustomerGroups(digestCustomers).map((g) => ` ${g.name} = ${g.members.join(' + ')} combined.`).join('')}
            </div>
          </div>
          <button className="btn bg" onClick={handleExportDigestPng} disabled={digestExporting || !digestSections.length}>
            {digestExporting ? 'EXPORTING…' : '🖼 EXPORT DIGEST PNG'}
          </button>
        </div>

        <div className="fw" style={{ marginTop: 12 }}>
          <ExcelFilterDropdown label="WEEKS" items={weeksNewestFirst} selected={selectedWeeks} onApply={setWeekPick} itemLabel={weekLabel} />
          <div className="fl" style={{ flex: 'none', width: 150 }}>
            <div className="fl-lbl">QUICK PICK MONTH</div>
            <select value="" onChange={(e) => handlePickMonth(e.target.value)}>
              <option value="">Month…</option>
              {[...monthOptions].reverse().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button className="btn bb" style={{ fontSize: 10, padding: '6px 11px' }} onClick={() => setWeekPick(null)}>
            LAST {REPORT_MAX_WEEKS} WEEKS
          </button>
          <FilterField label="KPI & TOP DEFECTS FROM" value={scope} onChange={setScope} width={210} options={SCOPE_OPTIONS} />
          {customers.length ? (
            <ExcelFilterDropdown label="CUSTOMERS" items={customers} selected={selectedCustomers} onApply={setSelectedCustomers} />
          ) : <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No customers yet — import defect data first.</div>}
        </div>

        {digestSections.length ? (
          <div style={{ marginTop: 12, maxHeight: 600, overflowY: 'auto', border: '1px solid var(--yc-border)', borderRadius: 8 }}>
            <DigestSnapshot ref={digestRef} sections={digestSections} range={range} />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--yc-muted)', marginTop: 10 }}>No selected customers have matched data for this week.</div>
        )}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="ct" style={{ marginBottom: 2 }}>🛠 CAPA EXPORT</div>
            <div style={{ fontSize: 10, color: 'var(--yc-muted)' }}>One spreadsheet, one row per CAPA chain, for every selected customer.</div>
          </div>
          <button className="btn bb" onClick={handleExportCapaXlsx} disabled={capaExporting || !capaExportCustomers.length}>
            {capaExporting ? 'EXPORTING…' : `EXPORT CAPA XLSX (${capaExportCustomers.length})`}
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {customers.length ? (
            <ExcelFilterDropdown label="CUSTOMERS" items={customers} selected={selectedCapaCustomers} onApply={setSelectedCapaCustomers} />
          ) : <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No customers yet — import defect data first.</div>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--yc-muted2)', marginTop: 10 }}>
            <input type="checkbox" checked={capaIncludeClosed} onChange={(e) => setCapaIncludeClosed(e.target.checked)} />
            Include closed chains
          </label>
        </div>
      </Card>

      <Card>
        <div className="fw">
          <FilterField label="CAPA TRACKER CUSTOMER" value={trackerCustomer} onChange={setTrackerCustomerPick} width={220}
            options={customers} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--yc-muted)', marginTop: 6 }}>Uses the last selected week above ({weekLabel(capaRange.to)}), never a roll-up.</div>
      </Card>

      {reportData ? (
        <CapaTracker
          customer={trackerCustomer}
          customerReportData={reportData}
          capaRecords={capaRecords}
          defectRows={defectRows}
          week={reportData.lw}
          showToast={showToast}
          showConfirm={showConfirm}
          onDataChanged={onDataChanged}
        />
      ) : (
        <Card><div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No matched Yield data for {trackerCustomer || 'this customer'} in the selected week.</div></Card>
      )}
    </div>
  );
}
