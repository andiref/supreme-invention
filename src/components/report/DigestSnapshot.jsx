import { forwardRef } from 'react';
import DigestCard from './DigestCard.jsx';

/**
 * The printable multi-customer digest — always rendered in a fixed light
 * "email document" palette regardless of the app's own dark/light theme,
 * so the exported PNG looks the same no matter who generates it or what
 * mode they're in. Each customer's DigestCard is a fully self-contained
 * report (its own identity + KPIs, defects, and trend charts) so a
 * single-customer digest matches the reference design; multiple customers
 * just stack one under the next.
 *
 * @param {{customer:string, data:object}[]} sections   result of buildDigestData()
 * @param {{from:string,to:string}} range
 */
const DigestSnapshot = forwardRef(function DigestSnapshot({ sections, range }, ref) {
  return (
    <div ref={ref} style={{
      width: 1600, minHeight: 900, boxSizing: 'border-box',
      background: '#f8fafc', color: '#172033', padding: 44,
      fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    }}
    >
      {sections.map(({ customer, data }, i) => (
        <DigestCard
          key={customer}
          customer={customer}
          data={data}
          weekBadge={range.to}
          first={i === 0}
        />
      ))}
    </div>
  );
});

export default DigestSnapshot;
