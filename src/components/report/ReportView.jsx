import { useEffect, useMemo, useRef, useState } from 'react';
import {
  calcMetrics, distinctWeeks, distinctCustomers, resolveWeekRange, resolveReportWeekRange, computeCustomerReportData,
} from '../../brain/index.js';
import { Card } from '../common/Kpi.jsx';
import FilterField from '../common/FilterField.jsx';
import ReportSnapshot from '../report/ReportSnapshot.jsx';
import { exportDigestPng } from '../report/renderDigestPng.js';
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

  // Digest customer picker — preserves whichever customers are already
  // checked when the customer list changes, defaulting any new/unseen
  // customer to checked (same behavior as the original app).
  const prevCheckedRef = useRef({});
  const [digestChecked, setDigestChecked] = useState({});
  useEffect(() => {
    const next = {};
    customers.forEach((c) => {
      next[c] = c in prevCheckedRef.current ? prevCheckedRef.current[c] : true;
    });
    prevCheckedRef.current = next;
    setDigestChecked(next);
  }, [customers]);

  function setAllDigestCustomers(checked) {
    const next = {};
    customers.forEach((c) => { next[c] = checked; });
    prevCheckedRef.current = next;
    setDigestChecked(next);
  }

  function toggleDigestCustomer(c) {
    setDigestChecked((prev) => {
      const next = { ...prev, [c]: !prev[c] };
      prevCheckedRef.current = next;
      return next;
    });
  }

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

  function handleGenerateDigest() {
    const selected = customers.filter((c) => digestChecked[c]);
    if (!selected.length) {
      showToast('Select at least one customer for the digest.');
      return;
    }
    if (!range) return;
    setExporting(true);
    try {
      const ok = exportDigestPng(selected, range, metrics, defectRows);
      if (!ok) {
        showToast('No data for the selected customers in this week range.');
      } else {
        showToast('✓ Digest PNG downloaded');
      }
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

        <div style={{ borderTop: '1px solid var(--yc-border)', margin: '12px 0 10px', paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--yc-muted)', marginBottom: 8 }}>
            📮 Generate one PNG covering selected customers, stacked — sized for a single email digest. Uses the same week range above.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div className="fl-lbl" style={{ margin: 0 }}>CUSTOMERS TO INCLUDE</div>
            <a href="#" onClick={(e) => { e.preventDefault(); setAllDigestCustomers(true); }} style={{ fontSize: 10 }}>Select all</a>
            <a href="#" onClick={(e) => { e.preventDefault(); setAllDigestCustomers(false); }} style={{ fontSize: 10 }}>Select none</a>
          </div>
          <div style={{
            maxHeight: 120, overflowY: 'auto', background: 'var(--yc-surface2)', border: '1px solid var(--yc-border)',
            borderRadius: 6, padding: '8px 12px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: '6px 18px',
          }}
          >
            {customers.length ? customers.map((c) => (
              <label key={c} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={!!digestChecked[c]} onChange={() => toggleDigestCustomer(c)} /> {c}
              </label>
            )) : <span style={{ fontSize: 11, color: 'var(--yc-muted)' }}>No customers yet — import defect data first.</span>}
          </div>
          <button className="btn bb" onClick={handleGenerateDigest} disabled={exporting}>
            {exporting ? 'GENERATING…' : '📧 GENERATE CUSTOMER DIGEST'}
          </button>
        </div>

        {reportData ? (
          <ReportSnapshot customer={customer} range={range} data={reportData} author={author} />
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
