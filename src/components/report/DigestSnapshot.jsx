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
  const generatedAt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return (
    <div ref={ref} style={{
      width: 1600, minHeight: 900, boxSizing: 'border-box',
      background: '#ffffff', color: '#172033', padding: 44,
      fontFamily: 'Inter, "Segoe UI", Arial, Helvetica, sans-serif',
      overflow: 'hidden',
    }}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, paddingBottom: 14, borderBottom: '2px solid #dbe3ef',
      }}
      >
        <div>
          <div style={{
            fontSize: 28, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.6px', color: '#102a56',
          }}
          >
            SMT WEEKLY QUALITY DIGEST
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#60708a', marginTop: 7 }}>
            Week {range.to} &nbsp;·&nbsp; Trend: last {REPORT_MAX_WEEKS} weeks &nbsp;·&nbsp; {sections.length} customer{sections.length === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, lineHeight: 1.5, color: '#6b7b94' }}>
          <div style={{ fontWeight: 800, color: '#102a56' }}>Weekly Quality Report</div>
          <div>Generated {generatedAt}</div>
        </div>
      </div>

      {sections.map(({ customer, data }, i) => (
        <DigestCard key={customer} customer={customer} data={data} color={CHART_COLORS[i % CHART_COLORS.length]} weekBadge={range.to} first={i === 0} />
      ))}

      <div style={{ borderTop: '1px solid #dbe3ef', marginTop: 18, paddingTop: 10, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#70809a' }}>SMT Command Center &nbsp;·&nbsp; Confidential</div>
      </div>
    </div>
  );
});

export default DigestSnapshot;
