import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import {
  calcMetrics, distinctWeeks, distinctCustomers, resolveWeekRange, resolveReportWeekRange, computeCustomerReportData, buildDigestData, buildCapaExportRows,
} from '../../brain/index.js';
import { Card } from '../common/Kpi.jsx';
import FilterField from '../common/FilterField.jsx';
import ReportSnapshot from '../report/ReportSnapshot.jsx';
import DigestSnapshot from '../report/DigestSnapshot.jsx';
import CapaTracker from '../capa/CapaTracker.jsx';

function weekLabel(w) {
  const m = String(w).match(/W(\d+)$/);
  return m ? `WW${m[1]}` : w;
}

export default function ReportView({ defectRows, prodVolRows, capaRecords, showToast, showConfirm, onDataChanged }) {
  const metrics = useMemo(() => calcMetrics(defectRows, prodVolRows), [defectRows, prodVolRows]);
  const allWeeks = useMemo(() => distinctWeeks(defectRows), [defectRows]);
  const customers = useMemo(() => distinctCustomers(defectRows), [defectRows]);

  const [author, setAuthor] = useState('');
  const [customer, setCustomer] = useState('ALL');
  const [fromWeek, setFromWeek] = useState('');
  const [toWeek, setToWeek] = useState('');
  const [showDigest, setShowDigest] = useState(false);
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

  function toggleCustomer(c) {
    setSelectedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }
  const selectAllCustomers = () => setSelectedCustomers(new Set(customers));
  const selectNoCustomers = () => setSelectedCustomers(new Set());

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

  function toggleCapaCustomer(c) {
    setSelectedCapaCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }
  const selectAllCapaCustomers = () => setSelectedCapaCustomers(new Set(customers));
  const selectNoCapaCustomers = () => setSelectedCapaCustomers(new Set());
  const [capaIncludeClosed, setCapaIncludeClosed] = useState(false);
  const [capaExporting, setCapaExporting] = useState(false);

  const defaultRange = useMemo(() => resolveReportWeekRange(allWeeks), [allWeeks]);
  const range = useMemo(() => {
    if (!allWeeks.length) return null;
    return resolveWeekRange(allWeeks, fromWeek || defaultRange?.from, toWeek || defaultRange?.to, toWeek ? 'to' : 'from');
  }, [allWeeks, fromWeek, toWeek, defaultRange]);

  function handleFromChange(v) {
    setFromWeek(v);
  }
  function handleToChange(v) {
    setToWeek(v);
  }

  const reportData = useMemo(() => {
    if (!range) return null;
    return computeCustomerReportData(customer, range, metrics, defectRows);
  }, [customer, range, metrics, defectRows]);

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

  const handleExportDigestPng = () => exportNode(digestRef.current, `SMT_Digest_${range.to}.png`, setDigestExporting);

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
    if (!capaExportCustomers.length || !range) return;
    setCapaExporting(true);
    try {
      const rows = buildCapaExportRows(capaExportCustomers, range, metrics, defectRows, capaRecords, capaIncludeClosed);
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
      XLSX.writeFile(wb, `CAPA_Export_${range.to}.xlsx`);
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
      <Card title="📧 CUSTOMER REPORT">
        <div className="fw" style={{ marginBottom: 10 }}>
          <FilterField label="FROM WEEK" value={range?.from || ''} onChange={handleFromChange} width={140}
            options={allWeeks.map((w) => ({ value: w, label: weekLabel(w) }))} />
          <FilterField label="TO WEEK" value={range?.to || ''} onChange={handleToChange} width={140}
            options={allWeeks.map((w) => ({ value: w, label: weekLabel(w) }))} />
          <FilterField label="CUSTOMER" value={customer} onChange={setCustomer} width={160}
            options={[{ value: 'ALL', label: 'All Customers' }, ...customers]} />
          <div className="fl" style={{ margin: 0 }}>
            <div className="fl-lbl">PREPARED BY</div>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" style={{ width: 150 }} />
          </div>
        </div>

        {reportData ? (
          <>
            <ReportSnapshot customer={customer} range={range} data={reportData} author={author} />
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No matched Yield data for {customer === 'ALL' ? 'any customer' : customer} in this week range.</div>
        )}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="ct" style={{ marginBottom: 2 }}>🗂 WEEKLY DIGEST</div>
            <div style={{ fontSize: 10, color: 'var(--yc-muted)' }}>One stacked image, every selected customer's KPI + trend for week {weekLabel(range.to)}.</div>
          </div>
          <button className="btn bb" onClick={() => setShowDigest((v) => !v)}>
            {showDigest ? 'HIDE DIGEST' : `GENERATE DIGEST (${digestCustomers.length})`}
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div className="fl-lbl">CUSTOMERS TO INCLUDE ({digestCustomers.length}/{customers.length})</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn bb" style={{ padding: '3px 9px', fontSize: 10 }} onClick={selectAllCustomers}>ALL</button>
              <button className="btn bb" style={{ padding: '3px 9px', fontSize: 10 }} onClick={selectNoCustomers}>NONE</button>
            </div>
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px 16px', maxHeight: 130, overflowY: 'auto', padding: 10, border: '1px solid var(--yc-border)', borderRadius: 6,
          }}
          >
            {customers.length ? customers.map((c) => (
              <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedCustomers.has(c)} onChange={() => toggleCustomer(c)} />
                {c}
              </label>
            )) : <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No customers yet — import defect data first.</div>}
          </div>
        </div>

        {showDigest && (
          digestSections.length ? (
            <>
              <div style={{ marginTop: 12, maxHeight: 600, overflowY: 'auto', border: '1px solid var(--yc-border)', borderRadius: 8 }}>
                <DigestSnapshot ref={digestRef} sections={digestSections} range={range} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn bg" onClick={handleExportDigestPng} disabled={digestExporting}>
                  {digestExporting ? 'EXPORTING…' : '🖼 EXPORT DIGEST PNG'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--yc-muted)', marginTop: 10 }}>No selected customers have matched data in this week range.</div>
          )
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div className="fl-lbl">CUSTOMERS TO INCLUDE ({capaExportCustomers.length}/{customers.length})</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn bb" style={{ padding: '3px 9px', fontSize: 10 }} onClick={selectAllCapaCustomers}>ALL</button>
              <button className="btn bb" style={{ padding: '3px 9px', fontSize: 10 }} onClick={selectNoCapaCustomers}>NONE</button>
            </div>
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px 16px', maxHeight: 130, overflowY: 'auto', padding: 10, border: '1px solid var(--yc-border)', borderRadius: 6,
          }}
          >
            {customers.length ? customers.map((c) => (
              <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedCapaCustomers.has(c)} onChange={() => toggleCapaCustomer(c)} />
                {c}
              </label>
            )) : <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No customers yet — import defect data first.</div>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--yc-muted2)', marginTop: 8 }}>
            <input type="checkbox" checked={capaIncludeClosed} onChange={(e) => setCapaIncludeClosed(e.target.checked)} />
            Include closed chains
          </label>
        </div>
      </Card>

      {reportData && customer !== 'ALL' && (
        <CapaTracker
          customer={customer}
          customerReportData={reportData}
          capaRecords={capaRecords}
          defectRows={defectRows}
          week={reportData.lw}
          showToast={showToast}
          showConfirm={showConfirm}
          onDataChanged={onDataChanged}
        />
      )}
      {customer === 'ALL' && (
        <Card><div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>Pick a specific customer above to open its CAPA tracker.</div></Card>
      )}
    </div>
  );
}
