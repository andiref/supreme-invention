// ============================================
// delimited.js — small RFC-4180-style parser for CSV/TSV text.
// Pure function: text in, rows of strings out. Supports quoted delimiters,
// escaped quotes (""), CRLF, and newlines inside quoted fields.
// ============================================

function countUnquoted(text, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(text) {
  const sample = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  const commas = countUnquoted(sample, ',');
  const tabs = countUnquoted(sample, '\t');
  return tabs > commas ? '\t' : ',';
}

/** Parse comma- or tab-delimited text into trimmed cell strings. */
export function splitDelimited(text, delimiter = null) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  if (!input.trim()) return [];

  const sep = delimiter === ',' || delimiter === '\t' ? delimiter : detectDelimiter(input);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let sawData = false;

  const pushCell = () => {
    row.push(cell.trim());
    cell = '';
  };

  const pushRow = () => {
    pushCell();
    if (row.some(value => value !== '')) rows.push(row);
    row = [];
    sawData = false;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        cell += '"';
        sawData = true;
        i += 1;
      } else {
        inQuotes = !inQuotes;
        sawData = true;
      }
      continue;
    }

    if (!inQuotes && ch === sep) {
      pushCell();
      sawData = true;
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      // Treat CRLF as one newline; lone CR is also accepted.
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      pushRow();
      continue;
    }

    cell += ch;
    sawData = true;
  }

  if (sawData || cell !== '' || row.length) pushRow();
  return rows;
}
