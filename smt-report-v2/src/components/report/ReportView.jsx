import { useMemo, useRef, useState } from 'react';
import {
  calcMetrics, distinctWeeks, distinctCustomers, resolveWeekRange, resolveReportWeekRange, computeCustomerReportData,
} from '../../brain/index.js';
import { Card } from '../common/Kpi.jsx';
import FilterField from '../common/FilterField.jsx';
import ReportSnapshot from '../report/ReportSnapshot.jsx';
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
  const snapshotRef = useRef(null);

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

  async function handleExportPng() {
    if (!snapshotRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(snapshotRef.current, { backgroundColor: '#0a0e17', scale: 2 });
      const link = document.createElement('a');
      link.download = `SMT_Report_${customer}_${range.from}_${range.to}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
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
        <Card><div style={{ fontSize: 12, color: '#64748b' }}>Import Defect Data on the Yield tab first — reports are built from that.</div></Card>
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
            <ReportSnapshot ref={snapshotRef} customer={customer} range={range} data={reportData} author={author} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn bg" onClick={handleExportPng} disabled={exporting}>
                {exporting ? 'EXPORTING…' : '🖼 EXPORT PNG'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#64748b' }}>No matched Yield data for {customer === 'ALL' ? 'any customer' : customer} in this week range.</div>
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
        <Card><div style={{ fontSize: 11, color: '#64748b' }}>Pick a specific customer above to open its CAPA tracker.</div></Card>
      )}
    </div>
  );
}
