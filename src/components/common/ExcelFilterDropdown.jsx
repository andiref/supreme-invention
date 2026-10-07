import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A compact "CUSTOMERS (5/7) ▾" trigger that opens an Excel AutoFilter-style
 * panel: a search box, a tri-state "(Select All)" checkbox, a scrollable
 * checklist, and explicit OK/Cancel buttons. Edits are a local draft until
 * OK is pressed — Cancel, Escape, or clicking outside the panel all discard
 * the draft and revert to whatever was last applied, same as Excel's own
 * column filter dropdown.
 *
 * @param {string} label                      trigger label, e.g. "CUSTOMERS"
 * @param {string[]} items                    every selectable option, in display order
 * @param {Set<string>} selected              the committed selection (owned by the caller)
 * @param {(next: Set<string>) => void} onApply   called with the new Set when OK is pressed
 * @param {(item: string) => string} [itemLabel]  optional display formatter (e.g. week -> "WW34")
 */
export default function ExcelFilterDropdown({
  label, items, selected, onApply, itemLabel,
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(selected);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);
  const selectAllRef = useRef(null);

  function openDropdown() {
    setPending(new Set(selected));
    setSearch('');
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const display = (it) => (itemLabel ? itemLabel(it) : it);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => display(it).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search]);

  const visibleSelectedCount = visibleItems.filter((it) => pending.has(it)).length;
  const allVisibleSelected = visibleItems.length > 0 && visibleSelectedCount === visibleItems.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  function toggleItem(it) {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(it)) next.delete(it); else next.add(it);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setPending((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleItems.forEach((it) => next.delete(it));
      else visibleItems.forEach((it) => next.add(it));
      return next;
    });
  }

  function handleOk() {
    onApply(pending);
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn bb"
        style={{ fontSize: 10, padding: '6px 11px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        onClick={() => (open ? setOpen(false) : openDropdown())}
      >
        {label} ({selected.size}/{items.length}) <span style={{ fontSize: 8 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
          width: 230, background: 'var(--yc-surface)', border: '1px solid var(--yc-border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', padding: 10,
        }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '6px 8px',
              marginBottom: 8, border: '1px solid var(--yc-border)', borderRadius: 4,
              background: 'var(--yc-surface2)', color: 'inherit',
            }}
          />

          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
            padding: '4px 2px 8px', borderBottom: '1px solid var(--yc-border)', marginBottom: 4, cursor: 'pointer',
          }}
          >
            <input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
            (Select All{search ? ' Visible' : ''})
          </label>

          <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 8 }}>
            {visibleItems.length ? visibleItems.map((it) => (
              <label key={it} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 2px', cursor: 'pointer' }}>
                <input type="checkbox" checked={pending.has(it)} onChange={() => toggleItem(it)} />
                {display(it)}
              </label>
            )) : <div style={{ fontSize: 10.5, color: 'var(--yc-muted)', padding: '6px 2px' }}>No matches.</div>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              type="button"
              className="btn"
              style={{ background: 'var(--yc-surface2)', color: 'var(--yc-muted2)', fontSize: 10, padding: '5px 12px' }}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button type="button" className="btn bg" style={{ fontSize: 10, padding: '5px 12px' }} onClick={handleOk}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
