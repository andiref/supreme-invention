import { useMemo, useState } from 'react';
import {
  calcMetrics, distinctWeeks, distinctCustomers, resolveWeekRange, resolveReportWeekRange, computeCustomerReportData,
} from '../../brain/index.js';
import { Card } from '../common/Kpi.jsx';
import FilterField from '../common/FilterField.jsx';
import ReportSnapshot from '../report/ReportSnapshot.jsx';
import { exportReportPng } from '../report/renderReportPng.js';
import CapaTracker from '../capa/CapaTracker.jsx';

function weekLabel(w) {
  const m = String(w).match(/W(\d+)$/);
  return m ? `WW${m[1]}` : w;
}

export default function ReportView({ defectRows, prodVolRows, capaRecords, userEmail, showToast, showConfirm }) {
  const metrics = useMemo(() => calcMetrics(defectRows, prodVolRows), [defectRows, prodVolRows]);
  const allWeeks = useMemo(() => distinctWeeks(defectRows), [defectRows]);
  const customers = useMemo(() => distinctCustomers(defectRows), [defectRows]);

  const [author, setAuthor] = useState('');
  const [customer, setCustomer] = useState('ALL');
  const [fromWeek, setFromWeek] = useState('');
  const [toWeek, setToWeek] = useState('');
  const [exporting, setExporting] = useState(false);

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

  function handleExportPng() {
    if (!reportData || !range) return;
    setExporting(true);
    try {
      // Hand-drawn Canvas report (KPI boxes, dual trend charts, ranked
      // Top-3 defect cards) — same layout as the original app, not a
      // screenshot of the on-screen preview.
      exportReportPng(customer, range, reportData, author);
      showToast('✓ PNG downloaded');
    } catch (err) {
      showToast(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
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
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn bg" onClick={handleExportPng} disabled={exporting}>
                {exporting ? 'EXPORTING…' : '🖼 EXPORT PNG'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No matched Yield data for {customer === 'ALL' ? 'any customer' : customer} in this week range.</div>
        )}
      </Card>

      {reportData && customer !== 'ALL' && (
        <CapaTracker
          customer={customer}
          customerReportData={reportData}
          capaRecords={capaRecords}
          week={reportData.lw}
          userEmail={userEmail}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      )}
      {customer === 'ALL' && (
        <Card><div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>Pick a specific customer above to open its CAPA tracker.</div></Card>
      )}
    </div>
  );
}
