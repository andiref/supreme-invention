import { useMemo, useRef, useState } from 'react';
import {
  calcMetrics, distinctWeeks, distinctCustomers, resolveWeekRange, resolveReportWeekRange, computeCustomerReportData, buildDigestData,
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

  const digestSections = useMemo(() => {
    if (!range) return [];
    return buildDigestData(customers, range, metrics, defectRows);
  }, [range, customers, metrics, defectRows]);

  async function exportNode(node, filename, setBusy) {
    if (!node) return;
    setBusy(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      // No forced backgroundColor here — the snapshot element already paints
      // its own opaque background via var(--yc-bg), so the export just
      // captures whatever theme is currently active (same as what's on screen).
      const canvas = await html2canvas(node, { scale: 2 });
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
            <div className="ct" style={{ marginBottom: 2 }}>🗂 WEEKLY DIGEST — ALL CUSTOMERS</div>
            <div style={{ fontSize: 10, color: 'var(--yc-muted)' }}>One stacked image, every customer's KPI + trend for week {weekLabel(range.to)}.</div>
          </div>
          <button className="btn bb" onClick={() => setShowDigest((v) => !v)}>
            {showDigest ? 'HIDE DIGEST' : `GENERATE DIGEST (${digestSections.length})`}
          </button>
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
            <div style={{ fontSize: 11, color: 'var(--yc-muted)', marginTop: 10 }}>No customers have matched data in this week range.</div>
          )
        )}
      </Card>

      {reportData && customer !== 'ALL' && (
        <CapaTracker
          customer={customer}
          customerReportData={reportData}
          capaRecords={capaRecords}
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
