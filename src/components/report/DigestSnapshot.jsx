import { forwardRef } from 'react';
import CustomerSection from './CustomerSection.jsx';
import { REPORT_MAX_WEEKS, CHART_COLORS } from '../../brain/index.js';

function weekLabel(w) {
  const m = String(w).match(/W(\d+)$/);
  return m ? `WW${m[1]}` : w;
}

/**
 * @param {{customer:string, data:object}[]} sections   result of buildDigestData()
 * @param {{from:string,to:string}} range
 */
const DigestSnapshot = forwardRef(function DigestSnapshot({ sections, range }, ref) {
  return (
    <div ref={ref} style={{ background: 'var(--yc-bg)', color: 'var(--yc-text)', padding: 24, borderRadius: 10, fontFamily: "'Courier New', monospace" }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>SMT WEEKLY YIELD &amp; DPPM TREND</div>
      <div style={{ fontSize: 11, color: 'var(--yc-muted)', marginTop: 4, paddingBottom: 14, borderBottom: '2px solid var(--yc-text)' }}>
        Week: {weekLabel(range.to)} · Trend: last {REPORT_MAX_WEEKS} weeks | {sections.length} customer{sections.length === 1 ? '' : 's'}
      </div>

      {sections.map(({ customer, data }, i) => (
        <CustomerSection key={customer} customer={customer} data={data} color={CHART_COLORS[i % CHART_COLORS.length]} />
      ))}
    </div>
  );
});

export default DigestSnapshot;
