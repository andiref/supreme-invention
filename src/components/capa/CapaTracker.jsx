import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { getCustomerCapaCards, capaCardMatchesSearch, capaChainRows } from '../../brain/index.js';
import CapaCard from './CapaCard.jsx';

export default function CapaTracker({ customer, customerReportData, capaRecords, week, showToast, showConfirm }) {
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

  function handleExport() {
    const rows = filteredCards.flatMap((c) => capaChainRows(customer, c, week, capaRecords));
    if (!rows.length) {
      showToast('Nothing to export');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CAPA');
    XLSX.writeFile(wb, `CAPA_${customer}_${week || 'export'}.xlsx`);
  }

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
        <button className="btn bb" onClick={handleExport}>⬇ EXPORT XLSX</button>
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
          />
        ))
      ) : (
        <div style={{ fontSize: 11, color: '#64748b' }}>No CAPA chains match.</div>
      )}
    </div>
  );
}
