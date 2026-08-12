import { useMemo, useState } from 'react';
import { DEFECT_LIBRARY, searchLibrary } from '../../brain/index.js';

export default function LibraryView() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(DEFECT_LIBRARY[0]?.id ?? null);

  const results = useMemo(() => searchLibrary(query), [query]);
  const selected = useMemo(() => DEFECT_LIBRARY.find((d) => d.id === selectedId) || results[0] || null, [selectedId, results]);

  return (
    <div id="yc-root">
      <div className="card">
        <div className="ct">📖 DEFECT KNOWLEDGE LIBRARY</div>
        <input
          type="text"
          placeholder="Search defect type or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 4 }}
        />
      </div>

      <div id="lib-wrap">
        <div id="lib-list">
          {results.map((d) => (
            <div
              key={d.id}
              className={`li ${selected?.id === d.id ? 'active' : ''}`}
              onClick={() => setSelectedId(d.id)}
            >
              <div style={{ fontSize: 12, fontWeight: 700 }}>{d.icon} {d.type}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>{d.cat}</div>
            </div>
          ))}
          {!results.length && <div style={{ fontSize: 11, color: '#64748b', padding: 8 }}>No matches.</div>}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {selected ? (
            <div className="card">
              <div className="ct">{selected.icon} {selected.type} <span style={{ color: '#64748b', fontWeight: 400 }}>— {selected.cat}</span></div>

              <div className="dk">
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>TYPICAL ROOT CAUSES</div>
                <ul style={{ paddingLeft: 18, fontSize: 12, color: '#e2e8f0', lineHeight: 1.8 }}>
                  {selected.causes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>

              <div className="dk">
                <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>5-WHY TEMPLATE</div>
                <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.9 }}>
                  {selected.whys.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              </div>

              <div className="dk">
                <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', marginBottom: 6 }}>CORRECTIVE ACTIONS</div>
                <ul style={{ paddingLeft: 18, fontSize: 12, color: '#e2e8f0', lineHeight: 1.8 }}>
                  {selected.actions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>

              <div className="dk">
                <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}>PREVENTION</div>
                <div style={{ fontSize: 12, color: '#e2e8f0' }}>{selected.prev}</div>
              </div>
            </div>
          ) : (
            <div className="card"><div style={{ fontSize: 11, color: '#64748b' }}>Select a defect type from the list.</div></div>
          )}
        </div>
      </div>
    </div>
  );
}
