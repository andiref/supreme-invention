import { forwardRef } from 'react';
import DigestCard from './DigestCard.jsx';

/**
 * The printable multi-customer digest — always rendered in a fixed light
 * "email document" palette regardless of the app's own dark/light theme,
 * so the exported PNG looks the same no matter who generates it or what
 * mode they're in. Each customer's DigestCard is a fully self-contained
 * report (its own header, status badge, and "Weekly Quality Report /
 * Generated" meta) so a single-customer digest matches the reference
 * design exactly; multiple customers just stack one under the next.
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
      background: '#eef1f6', color: '#172033', padding: 32,
      fontFamily: 'Inter, "Segoe UI", Arial, Helvetica, sans-serif',
    }}
    >
      {sections.map(({ customer, data }, i) => (
        <DigestCard
          key={customer}
          customer={customer}
          data={data}
          weekBadge={range.to}
          generatedAt={generatedAt}
          first={i === 0}
        />
      ))}
    </div>
  );
});

export default DigestSnapshot;
