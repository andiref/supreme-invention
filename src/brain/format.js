// Locale-independent number formatting for display.
//
// Plain `.toLocaleString()` with no locale argument silently follows
// whatever locale the *viewer's* browser/OS is set to. In many locales
// (id-ID, de-DE, etc.) the thousands separator is a period, not a comma —
// so a DPPM of 21,005 renders as "21.005", which reads like "twenty-one
// point zero-zero-five" rather than "twenty-one thousand". That's a
// 1,000x misread sitting right next to values that DO use '.' as a decimal
// point (e.g. "97.90%" from .toFixed()), which is genuinely confusing in
// the same report — especially since these numbers get shared with
// customers as exported report images.
//
// fmtInt always renders with en-US grouping (comma thousands separator)
// regardless of who's viewing it. Use this instead of a bare
// .toLocaleString() for any integer count (DPPM, inspected/failed counts,
// row counts, etc).
export function fmtInt(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
}
