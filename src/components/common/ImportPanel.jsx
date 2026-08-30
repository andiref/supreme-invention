import { useRef, useState } from 'react';
import { readFileAsRows, parseDefectImportRows, parseProdVolImportRows } from '../../brain/index.js';
import { importDefects, importProdVol } from '../../api/client.js';

const COPY = {
  defect: {
    title: '📋 DEFECT RAW DATA — Customer|SerialNo|Model|DefectType|Component|DateTime|Side',
    format: 'Customer | SerialNumber | Model | DefectType | Component | MM/DD/YYYY HH:MM:SS | Side(TOP/BOT)',
    note: '⚠ Each row = 1 defect. Same SN+Side = 1 failed pass. Different Side = separate failure.',
    example: 'CUST-A   SN-001   MODEL-AA1   Solder Bridge   R1   04/07/2025 08:23:15   TOP',
  },
  prodvol: {
    title: '📊 PRODUCTION VOLUME — Week|Model|Side|Customer|TotalInspected',
    format: 'Week | Model | Side | Customer | TotalInspected — one row per side.',
    note: '⚠ Week format: 2026-W17  |  TOP and BOT as separate rows.',
    example: '2026-W17   MODEL-AA1   TOP   CUST-A   1500',
  },
};

export default function ImportPanel({ type, onImported, onClose }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null); // { rows, skipped }
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileInputRef = useRef(null);

  const copy = COPY[type];

  async function handleFileChange(e) {
    const f = e.target.files[0];
    setFile(f);
    setParsed(null);
    setError('');
    if (!f) return;
    try {
      const rawRows = await readFileAsRows(f);
      const result = type === 'defect' ? parseDefectImportRows(rawRows) : parseProdVolImportRows(rawRows);
      if (!result.rows.length) {
        setError('No valid rows found — check the file matches the format above.');
        return;
      }
      setParsed(result);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleImport() {
    if (!parsed?.rows.length) return;
    setImporting(true);
    setError('');
    try {
      const fn = type === 'defect' ? importDefects : importProdVol;
      const result = await fn(parsed.rows, file?.name, (done, total, batchNum, totalBatches) => {
        setProgress({ done, total, batchNum, totalBatches });
      });
      onImported(result, type);
      setFile(null);
      setParsed(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(`${err.message}${err.batchNum ? ` (stopped on batch ${err.batchNum}/${err.totalBatches}, ${err.importedSoFar} rows already imported)` : ''}`);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  return (
    <div className="card">
      <div className="ct">{copy.title}</div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, lineHeight: 1.9 }}>
        Format: <span style={{ color: '#3b82f6' }}>{copy.format}</span><br />
        <span style={{ color: '#f59e0b' }}>{copy.note}</span><br />
        <span style={{ color: '#22c55e' }}>💡 Upload a .csv, .txt, .xlsx, or .xls file — a header row (if any) is skipped automatically. Large files are sent in batches automatically.</span>
      </div>
      <div className="pc">
        {copy.example}
      </div>
      <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFileChange} />
      {error && <div className="err">{error}</div>}
      {parsed && !error && (
        <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>
          ✓ {parsed.rows.length} valid row(s) ready{parsed.skipped ? `, ${parsed.skipped} skipped (bad format)` : ''}
        </div>
      )}
      {progress && (
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
          Uploading batch {progress.batchNum}/{progress.totalBatches}… ({progress.done}/{progress.total} rows)
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className={type === 'defect' ? 'btn bg' : 'btn bb'} onClick={handleImport} disabled={!parsed?.rows.length || importing}>
          {importing ? 'IMPORTING…' : type === 'defect' ? 'IMPORT & CALCULATE' : 'IMPORT'}
        </button>
        <button className="btn bx" onClick={onClose} disabled={importing}>CANCEL</button>
      </div>
    </div>
  );
}
