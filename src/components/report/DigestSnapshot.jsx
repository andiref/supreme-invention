import { forwardRef } from 'react';
import DigestCard from './DigestCard.jsx';
import { REPORT_MAX_WEEKS, CHART_COLORS } from '../../brain/index.js';

/**
 * The printable multi-customer digest — always rendered in a fixed light
 * "email document" palette regardless of the app's own dark/light theme,
 * so the exported PNG looks the same no matter who generates it or what
 * mode they're in.
 *
 * @param {{customer:string, data:object}[]} sections   result of buildDigestData()
 * @param {{from:string,to:string}} range
 */
const DigestSnapshot = forwardRef(function DigestSnapshot({ sections, range }, ref) {
  const generatedAt = new Date().toLocaleString();
  return (
    <div ref={ref} style={{ background: '#ffffff', color: '#000000', padding: 24, fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>SMT WEEKLY YIELD &amp; DPPM TREND</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#444444', marginTop: 6, paddingBottom: 12, marginBottom: 16, borderBottom: '2px solid #000000' }}>
        Week: {range.to} &nbsp;·&nbsp; Trend: last {REPORT_MAX_WEEKS} weeks &nbsp;|&nbsp; {sections.length} customer{sections.length === 1 ? '' : 's'}
      </div>

      {sections.map(({ customer, data }, i) => (
        <DigestCard key={customer} customer={customer} data={data} color={CHART_COLORS[i % CHART_COLORS.length]} weekBadge={range.to} first={i === 0} />
      ))}

      <div style={{ borderTop: '1px solid rgba(0,0,0,0.3)', marginTop: 16, paddingTop: 10, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#444444' }}>SMT Command Center &nbsp;·&nbsp; {generatedAt} &nbsp;·&nbsp; Confidential</div>
      </div>
    </div>
  );
});

export default DigestSnapshot;
