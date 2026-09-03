import { useMemo, useState } from 'react';
import { getCustomerCapaCards, capaCardMatchesSearch } from '../../brain/index.js';
import CapaCard from './CapaCard.jsx';

export default function CapaTracker({ customer, customerReportData, capaRecords, week, showToast, showConfirm, onDataChanged }) {
  const [search, setSearch] = useState('');
  const [includeClosed, setIncludeClosed] = useState(false);

  const cards = useMemo(
    () => getCustomerCapaCards(customerReportData, customer, capaRecords, includeClosed),
    [customerReportData, customer, capaRecords, includeClosed]
  );

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => capaCardMatchesSearch(customer, c, capaRecords, q));
  }, [cards, customer, capaRecords, search]);


  return (
    <div className="card">
      <div className="ct">🛠 CAPA TRACKER — {customer}</div>
      <div className="fw" style={{ marginBottom: 10 }}>
        <div className="fl" style={{ margin: 0 }}>
          <div className="fl-lbl">SEARCH CHAINS</div>
          <input
            type="text"
            placeholder="defect, model, ref, root cause…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--yc-muted2)' }}>
          <input type="checkbox" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} />
          Include closed
        </label>
      </div>

      {filteredCards.length ? (
        filteredCards.map((card) => (
          <CapaCard
            key={card.key}
            customer={customer}
            card={card}
            capaRecords={capaRecords}
            week={week}
            showToast={showToast}
            showConfirm={showConfirm}
            onDataChanged={onDataChanged}
          />
        ))
      ) : (
        <div style={{ fontSize: 11, color: '#64748b' }}>No CAPA chains match.</div>
      )}
    </div>
  );
}
