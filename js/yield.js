/* ═══════════════════════════════════════════════════════════
   YIELD & DPPM ANALYTICS
   ═══════════════════════════════════════════════════════════ */

var rawDef = [], prodVol = [], modelTiers = [];
var yieldFilters = { customer: '', model: '', from: '', to: '' };
var lastYieldReport = null; // populated by updateYield(), read by exportYieldReport()

// Cached CSS variable reader
var cssVarCache = {};
function cssVar(name) {
    if (!cssVarCache[name]) {
        cssVarCache[name] = getComputedStyle(document.body).getPropertyValue(name).trim();
    }
    return cssVarCache[name];
}
function invalidateCssVarCache() { cssVarCache = {}; }

function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function parseDT(s) {
    var m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    var[,mm,dd,yyyy,hh,min,ss] = m;
    var d = new Date(+yyyy, +mm - 1, +dd, +hh, +min, +(ss || 0));
    if (d.getMonth() !== +mm - 1) return null; // invalid date like 02/30
    return d;
}

function toISO(dt) {
    return dt.toISOString().slice(0, 10);
}

function weekLabel(dt) {
    var d = new Date(dt);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    var y = d.getFullYear();
    var start = new Date(y, 0, 1);
    var diff = d - start + ((start.getDay() + 1) % 7) * 86400000;
    var week = Math.ceil(diff / 604800000);
    return y + '-W' + String(week).padStart(2, '0');
}

function renderYield() {
    var container = document.getElementById('yield-filters');
    if (!container) return;

    container.innerHTML =
        '<select id="yf-cust" onchange="updateYield()"><option value="">All Customers</option>' +
        customerArray().map(function(c) { return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>'; }).join('') +
        '</select>' +
        '<select id="yf-model" onchange="updateYield()"><option value="">All Models</option>' +
        modelArray().map(function(m) { return '<option value="' + esc(m.code) + '">' + esc(m.code) + '</option>'; }).join('') +
        '</select>' +
        '<input type="date" id="yf-from" onchange="updateYield()" />' +
        '<input type="date" id="yf-to" onchange="updateYield()" />' +
        '<button class="submit-btn" onclick="updateYield()">Refresh</button>';

    updateYield();
}

function buildVolMap() {
    var volMap = {};
    prodVol.forEach(function(v) {
        var key = v.week + '_' + v.customer + '_' + v.model;
        volMap[key] = (volMap[key] || 0) + (v.inspTOP || 0) + (v.inspBOT || 0);
    });
    return volMap;
}

function computePareto(defects) {
    if (!defects.length) return [];
    var counts = {};
    defects.forEach(function(r) { counts[r.defect] = (counts[r.defect] || 0) + 1; });
    var rows = Object.keys(counts)
        .map(function(k) { return { type: k, count: counts[k] }; })
        .sort(function(a, b) { return b.count - a.count; });
    var total = defects.length;
    var cum = 0;
    rows.forEach(function(r) {
        cum += r.count;
        r.pct = r.count / total * 100;
        r.cumPct = cum / total * 100;
    });
    return rows;
}

function updateYield() {
    var cust = document.getElementById('yf-cust').value;
    var model = document.getElementById('yf-model').value;
    var from = document.getElementById('yf-from').value;
    var to = document.getElementById('yf-to').value;

    var filtered = rawDef.filter(function(r) {
        var d = parseDT(r.dtStr);
        if (!d) return false;
        var iso = toISO(d);
        return (!cust || r.customer === cust) &&
               (!model || r.model === model) &&
               (!from || iso >= from) &&
               (!to || iso <= to);
    });

    var weeks = {};
    filtered.forEach(function(r) {
        var d = parseDT(r.dtStr);
        if (!d) return;
        var w = weekLabel(d);
        if (!weeks[w]) weeks[w] = { TOP: { total: 0, unique: new Set() }, BOT: { total: 0, unique: new Set() }, groupKeys: new Set(), count: 0 };
        weeks[w][r.side].total++;
        weeks[w][r.side].unique.add(r.sn);
        weeks[w].groupKeys.add(w + '_' + r.customer + '_' + r.model);
        weeks[w].count++;
    });

    var wkArr = Object.keys(weeks).sort();
    var volMap = buildVolMap();

    // Volume is summed once per (week, customer, model) group via groupKeys
    // — not once per defect in that group. Previously it was added once for
    // every defect that fell in the group, so a defect-heavy week inflated
    // the volume denominator and made DPPM come out artificially low.
    var chartData = wkArr.map(function(w) {
        var vol = 0;
        weeks[w].groupKeys.forEach(function(k) { vol += volMap[k] || 0; });
        var defCount = weeks[w].count;
        return {
            week: w,
            topFails: weeks[w].TOP.total,
            topUnique: weeks[w].TOP.unique.size,
            botFails: weeks[w].BOT.total,
            botUnique: weeks[w].BOT.unique.size,
            vol: vol,
            dppm: vol ? Math.round((defCount / vol) * 1000000) : 0
        };
    });

    var pareto = computePareto(filtered);
    var totalVol = chartData.reduce(function(sum, w) { return sum + w.vol; }, 0);
    var totalDefects = filtered.length;
    var uniqueSN = new Set(filtered.map(function(r) { return r.sn; })).size;
    var dppm = totalVol ? Math.round((totalDefects / totalVol) * 1000000) : 0;

    lastYieldReport = {
        cust: cust, model: model, from: from, to: to,
        filtered: filtered, chartData: chartData, pareto: pareto,
        totalDefects: totalDefects, uniqueSN: uniqueSN, totalVol: totalVol, dppm: dppm
    };

    renderYieldCharts(chartData);
    renderYieldSummary(totalDefects, uniqueSN, totalVol, dppm, pareto);
}

function renderYieldCharts(data) {
    var container = document.getElementById('yield-charts');
    if (!container) return;
    if (!data.length) { container.innerHTML = '<p style="color:var(--muted)">No data for selected filters.</p>'; return; }

    var html = '<div class="form-card" style="margin-bottom:16px;"><div class="form-title">DPPM Trend</div><canvas id="chart-dppm"></canvas></div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">';
    html += '<div class="form-card"><div class="form-title">Weekly Failures (TOP)</div><canvas id="chart-top"></canvas></div>';
    html += '<div class="form-card"><div class="form-title">Weekly Failures (BOT)</div><canvas id="chart-bot"></canvas></div>';
    html += '</div>';
    container.innerHTML = html;

    drawBarChart('chart-dppm', data.map(function(d) { return d.week; }), data.map(function(d) { return d.dppm; }), '#eab308');
    drawBarChart('chart-top', data.map(function(d) { return d.week; }), data.map(function(d) { return d.topFails; }), '#3b82f6');
    drawBarChart('chart-bot', data.map(function(d) { return d.week; }), data.map(function(d) { return d.botFails; }), '#22c55e');
}

function drawBarChart(canvasId, labels, values, color) {
    var cv = document.getElementById(canvasId);
    if (!cv) return;
    var parent = cv.parentElement;
    var W = parent.clientWidth - 32;
    var H = 220;
    var dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, W, H);
    var max = Math.max.apply(Math, values) || 1;
    var barW = (W - 40) / values.length - 8;
    var barMaxH = H - 50;

    ctx.fillStyle = cssVar('--muted');
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';

    values.forEach(function(v, i) {
        var x = 20 + i * ((W - 40) / values.length) + 4;
        var bh = (v / max) * barMaxH;
        var y = H - 30 - bh;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, barW, bh);

        ctx.fillStyle = cssVar('--text');
        ctx.fillText(v, x + barW / 2, y - 4);
        ctx.fillStyle = cssVar('--muted');
        ctx.fillText(labels[i], x + barW / 2, H - 10);
    });
}

function renderYieldSummary(totalDefects, uniqueSN, totalVol, dppm, pareto) {
    var container = document.getElementById('yield-summary');
    if (!container) return;

    container.innerHTML =
        '<div class="cards-row">' +
        '<div class="card"><div class="card-label">Total Defects</div><div class="card-value">' + totalDefects + '</div></div>' +
        '<div class="card"><div class="card-label">Unique SN Failed</div><div class="card-value">' + uniqueSN + '</div></div>' +
        '<div class="card"><div class="card-label">Est. Volume</div><div class="card-value">' + totalVol.toLocaleString() + '</div></div>' +
        '<div class="card"><div class="card-label">DPPM</div><div class="card-value">' + dppm.toLocaleString() + '</div></div>' +
        '</div>' +
        renderParetoHTML(pareto);

    if (pareto.length) {
        var top = pareto.slice(0, 10);
        drawBarChart('chart-pareto', top.map(function(r) { return r.type; }), top.map(function(r) { return r.count; }), '#f97316');
    }
}

function renderParetoHTML(pareto) {
    if (!pareto.length) return '';
    var top = pareto.slice(0, 10);
    var rows = top.map(function(r) {
        return '<tr><td>' + esc(r.type) + '</td><td>' + r.count + '</td><td>' + r.pct.toFixed(1) + '%</td><td>' + r.cumPct.toFixed(1) + '%</td></tr>';
    }).join('');

    return '<div class="form-card" style="margin-top:4px;">' +
        '<div class="form-title">Defect Pareto' + (pareto.length > 10 ? ' (top 10)' : '') + '</div>' +
        '<canvas id="chart-pareto"></canvas>' +
        '<div class="preview-wrap" style="margin-top:10px;">' +
        '<table class="preview-table"><thead><tr><th>Defect Type</th><th>Count</th><th>% of Total</th><th>Cum. %</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div>';
}

function exportYieldReport() {
    if (typeof XLSX === 'undefined') { showToast('Export unavailable — XLSX library failed to load'); return; }
    if (!lastYieldReport || !lastYieldReport.filtered.length) { showToast('Nothing to export — adjust filters first'); return; }

    var r = lastYieldReport;
    var wb = XLSX.utils.book_new();

    var summaryAOA = [
        ['SMT Yield & DPPM Report'],
        ['Generated', new Date().toLocaleString()],
        ['Customer filter', r.cust || 'All'],
        ['Model filter', r.model || 'All'],
        ['Date from', r.from || '(none)'],
        ['Date to', r.to || '(none)'],
        [],
        ['Total Defects', r.totalDefects],
        ['Unique SN Failed', r.uniqueSN],
        ['Est. Volume Inspected', r.totalVol],
        ['DPPM', r.dppm]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAOA), 'Summary');

    var weeklyAOA = [['Week', 'TOP Fails', 'TOP Unique SN', 'BOT Fails', 'BOT Unique SN', 'Volume', 'DPPM']]
        .concat(r.chartData.map(function(w) { return [w.week, w.topFails, w.topUnique, w.botFails, w.botUnique, w.vol, w.dppm]; }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weeklyAOA), 'Weekly Trend');

    var paretoAOA = [['Defect Type', 'Count', '% of Total', 'Cumulative %']]
        .concat(r.pareto.map(function(p) { return [p.type, p.count, p.pct.toFixed(1) + '%', p.cumPct.toFixed(1) + '%']; }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paretoAOA), 'Defect Pareto');

    var rawAOA = [['Customer', 'Model', 'Serial', 'Side', 'Component', 'Defect Type', 'DateTime']]
        .concat(r.filtered.map(function(d) { return [d.customer, d.model, d.sn, d.side, d.comp, d.defect, d.dtStr]; }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rawAOA), 'Raw Defects');

    XLSX.writeFile(wb, 'yield_report_' + toISO(new Date()) + '.xlsx');
}

// ═══════════════════════════════════════════════════════════
// FILE UPLOAD ENGINE
// ═══════════════════════════════════════════════════════════

var UPLOAD = {
    defect: { headers: [], rows: [], mapped: {} },
    prod:   { headers: [], rows: [], mapped: {} }
};

var UPLOAD_SCHEMA = {
    defect: {
        fields: [
            { key: 'customer',  label: 'Customer',      req: true,  test: /customer/i },
            { key: 'sn',        label: 'Serial Number', req: true,  test: /serial|sn|s\.n/i },
            { key: 'model',     label: 'Model',         req: true,  test: /model/i },
            { key: 'defect',    label: 'Defect Type',   req: true,  test: /defect|type|finding/i },
            { key: 'comp',      label: 'Component',     req: true,  test: /comp|component|ref/i },
            { key: 'datetime',  label: 'DateTime',      req: true,  test: /date|time|dt/i },
            { key: 'side',      label: 'Side',          req: true,  test: /side/i },
        ]
    },
    prod: {
        fields: [
            { key: 'week',      label: 'Week',            req: true,  test: /week/i },
            { key: 'customer',  label: 'Customer',        req: false, test: /customer/i },
            { key: 'model',     label: 'Model',           req: true,  test: /model/i },
            { key: 'side',      label: 'Side (TOP/BOT)',  req: true,  test: /side/i },
            { key: 'count',     label: 'Total Inspected', req: true,  test: /total|insp|count|qty/i },
        ]
    }
};

function initUpload(type) {
    var dz = document.getElementById('dz-' + type);
    var input = document.getElementById('file-' + type);
    if (!dz || !input) return;

    dz.addEventListener('click', function() { input.click(); });
    dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', function() { dz.classList.remove('dragover'); });
    dz.addEventListener('drop', function(e) {
        e.preventDefault(); dz.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleUploadFile(type, e.dataTransfer.files[0]);
    });
    input.addEventListener('change', function() {
        if (input.files.length) handleUploadFile(type, input.files[0]);
    });
}

function handleUploadFile(type, file) {
    if (typeof XLSX !== 'undefined') {
        handleUploadFileClient(type, file);
        return;
    }
    if (!currentUser) { showToast('Not logged in'); return; }
    handleUploadFileServer(type, file);
}

function handleUploadFileClient(type, file) {
    var btn = document.getElementById('btn-import-' + type);
    if (btn) { btn.disabled = true; btn.textContent = 'Parsing…'; }

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, { type: 'array' });
            var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            var json = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
            if (!json.length || !json[0].length) throw new Error('Empty file');

            UPLOAD[type].headers = json[0].map(function(h) { return String(h).trim(); });
            UPLOAD[type].rows = json.slice(1).filter(function(r) { return r.some(function(c) { return String(c).trim(); }); });

            document.getElementById('fname-' + type).textContent = file.name;
            document.getElementById('frows-' + type).textContent = UPLOAD[type].rows.length;
            document.getElementById('badge-' + type).classList.remove('hidden');

            buildMapping(type);
            autoMap(type);
            checkMapping(type);

            document.getElementById('map-' + type).classList.remove('hidden');
            document.getElementById('preview-' + type).classList.remove('hidden');

            if (btn) { btn.textContent = type === 'defect' ? 'Import & Calculate' : 'Import Production Volume'; }
        } catch (err) {
            showToast('Parse error: ' + err.message);
            if (btn) { btn.textContent = type === 'defect' ? 'Import & Calculate' : 'Import Production Volume'; }
        }
    };
    reader.readAsArrayBuffer(file);
}

function handleUploadFileServer(type, file) {
    var btn = document.getElementById('btn-import-' + type);
    if (btn) { btn.disabled = true; btn.textContent = 'Parsing on server…'; }

    var reader = new FileReader();
    reader.onload = function(e) {
        var base64 = arrayBufferToBase64(e.target.result);
        var mapping = {};
        var schema = UPLOAD_SCHEMA[type];
        schema.fields.forEach(function(f) {
            var sel = document.getElementById('sel-' + type + '-' + f.key);
            if (sel && sel.value && sel.value !== '— Select column —') {
                mapping[f.key] = parseInt(sel.value);
            }
        });

        fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
            body: JSON.stringify({ type: type, fileBase64: base64, mapping: mapping })
        }).then(function(r) { return r.json(); })
          .then(function(d) {
              if (btn) { btn.textContent = type === 'defect' ? 'Import & Calculate' : 'Import Production Volume'; }
              if (d.ok) {
                  UPLOAD[type].headers = d.headers;
                  UPLOAD[type].rows = d.rows;
                  UPLOAD[type].mapped = mapping;

                  document.getElementById('fname-' + type).textContent = file.name;
                  document.getElementById('frows-' + type).textContent = d.totalRows;
                  document.getElementById('badge-' + type).classList.remove('hidden');
                  document.getElementById('map-' + type).classList.remove('hidden');
                  document.getElementById('preview-' + type).classList.remove('hidden');

                  renderPreviewFromServer(type, d);
                  document.getElementById('btn-import-' + type).disabled = false;
              } else {
                  showToast('Server parse error: ' + d.error);
              }
          }).catch(function() {
              if (btn) { btn.disabled = false; btn.textContent = type === 'defect' ? 'Import & Calculate' : 'Import Production Volume'; }
              showToast('Network error');
          });
    };
    reader.readAsArrayBuffer(file);
}

function buildMapping(type) {
    var container = document.getElementById('map-' + type);
    var schema = UPLOAD_SCHEMA[type];
    var headers = UPLOAD[type].headers;

    container.innerHTML = schema.fields.map(function(f) {
        return '<div class="map-box" id="mbox-' + type + '-' + f.key + '">' +
            '<div class="map-label">' + f.label + (f.req ? ' <span class="req">*</span>' : '') + '</div>' +
            '<select id="sel-' + type + '-' + f.key + '" onchange="checkMapping(\'' + type + '\')">' +
            '<option>— Select column —</option>' +
            headers.map(function(h, i) { return '<option value="' + i + '">' + esc(h) + '</option>'; }).join('') +
            '</select></div>';
    }).join('');
}

function autoMap(type) {
    var schema = UPLOAD_SCHEMA[type];
    var headers = UPLOAD[type].headers;
    schema.fields.forEach(function(f) {
        var idx = headers.findIndex(function(h) { return f.test.test(h); });
        if (idx !== -1) {
            var sel = document.getElementById('sel-' + type + '-' + f.key);
            if (sel) sel.value = idx;
        }
    });
}

function checkMapping(type) {
    var schema = UPLOAD_SCHEMA[type];
    var mapped = {};
    var allOk = true;

    schema.fields.forEach(function(f) {
        var sel = document.getElementById('sel-' + type + '-' + f.key);
        var box = document.getElementById('mbox-' + type + '-' + f.key);
        var val = sel ? sel.value : '';
        if (val && val !== '— Select column —') {
            mapped[f.key] = parseInt(val);
            box.classList.add('mapped');
        } else {
            box.classList.remove('mapped');
            if (f.req) allOk = false;
        }
    });

    UPLOAD[type].mapped = mapped;
    document.getElementById('btn-import-' + type).disabled = !allOk;
    if (allOk) renderPreview(type);
}

function renderPreview(type) {
    var rows = UPLOAD[type].rows;
    var mapped = UPLOAD[type].mapped;
    var table = document.getElementById('tbl-' + type);
    var thead = table.querySelector('thead tr');
    var tbody = table.querySelector('tbody');

    var schema = UPLOAD_SCHEMA[type];
    var keys = schema.fields.filter(function(f) { return mapped[f.key] !== undefined; }).map(function(f) { return f.key; });

    thead.innerHTML = keys.map(function(k) {
        var f = schema.fields.find(function(x) { return x.key === k; });
        return '<th>' + esc(f.label) + '</th>';
    }).join('') + '<th>Status</th>';

    var display = rows.slice(0, 10);
    var fullValid = 0, fullErr = 0;

    tbody.innerHTML = display.map(function(row) {
        var err = '', cells = '';
        keys.forEach(function(k) {
            var idx = mapped[k];
            var val = row[idx] !== undefined ? String(row[idx]).trim() : '';
            var cls = '';
            if (k === 'side' && !/^(TOP|BOT)$/i.test(val)) { err = 'Invalid side'; cls = 'err-cell'; }
            if (k === 'datetime' && type === 'defect') {
                if (!/^\d{1,2}\/\d{1,2}\/\d{4}/.test(val)) { err = 'Bad date'; cls = 'err-cell'; }
            }
            if (k === 'count' && type === 'prod') {
                if (isNaN(parseInt(val))) { err = 'Not a number'; cls = 'err-cell'; }
            }
            cells += '<td class="' + cls + '">' + (val || '—') + '</td>';
        });
        return '<tr>' + cells + '<td class="' + (err ? 'err-cell' : 'ok-cell') + '">' + (err || '✓') + '</td></tr>';
    }).join('');

    rows.forEach(function(row) {
        var ok = true;
        if (type === 'defect') {
            ok = /^(TOP|BOT)$/i.test(String(row[mapped.side] || '')) &&
                 /^\d{1,2}\/\d{1,2}\/\d{4}/.test(String(row[mapped.datetime] || ''));
        } else {
            ok = /^(TOP|BOT)$/i.test(String(row[mapped.side] || '')) && !isNaN(parseInt(row[mapped.count]));
        }
        ok ? fullValid++ : fullErr++;
    });

    document.getElementById('stats-' + type).innerHTML =
        '<span>📄 <b>' + rows.length + '</b> rows</span>' +
        '<span>✅ <b>' + fullValid + '</b> valid</span>' +
        (fullErr ? '<span>⚠️ <b>' + fullErr + '</b> issues</span>' : '') +
        '<span>👁 First 10 shown</span>';
}

function renderPreviewFromServer(type, data) {
    var table = document.getElementById('tbl-' + type);
    var thead = table.querySelector('thead tr');
    var tbody = table.querySelector('tbody');
    var schema = UPLOAD_SCHEMA[type];
    var sample = data.rows[0] || {};
    var keys = schema.fields.filter(function(f) { return sample[f.key] !== undefined; }).map(function(f) { return f.key; });

    thead.innerHTML = keys.map(function(k) {
        var f = schema.fields.find(function(x) { return x.key === k; });
        return '<th>' + esc(f.label) + '</th>';
    }).join('') + '<th>Status</th>';

    var display = data.rows.slice(0, 10);
    tbody.innerHTML = display.map(function(row) {
        var cells = keys.map(function(k) {
            return '<td>' + esc(String(row[k] || '')) + '</td>';
        }).join('');
        return '<tr>' + cells + '<td class="ok-cell">✓</td></tr>';
    }).join('');

    document.getElementById('stats-' + type).innerHTML =
        '<span>📄 <b>' + data.totalRows + '</b> rows</span>' +
        '<span>✅ <b>' + data.valid + '</b> valid</span>' +
        (data.invalid ? '<span>⚠️ <b>' + data.invalid + '</b> issues</span>' : '') +
        '<span>👁 First 10 shown</span>';
}

function clearUpload(type) {
    UPLOAD[type] = { headers: [], rows: [], mapped: {} };
    document.getElementById('file-' + type).value = '';
    document.getElementById('badge-' + type).classList.add('hidden');
    document.getElementById('map-' + type).classList.add('hidden');
    document.getElementById('preview-' + type).classList.add('hidden');
    document.getElementById('btn-import-' + type).disabled = true;
}

function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function submitUploadSingleShot(type) {
    var btn = document.getElementById('btn-import-' + type);
    var mapped = UPLOAD[type].mapped;
    if (!Object.keys(mapped).length) { showToast('Map columns first'); return; }

    var input = document.getElementById('file-' + type);
    var file = input.files[0];
    if (!file) { showToast('No file selected'); return; }
    if (!currentUser) { showToast('Not logged in'); return; }

    var mapping = {};
    for (var k in mapped) mapping[k] = mapped[k];

    btn.disabled = true;
    btn.textContent = 'Importing…';

    var reader = new FileReader();
    reader.onload = function(e) {
        fetch('/api/upload-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
            body: JSON.stringify({ type: type, fileBase64: arrayBufferToBase64(e.target.result), mapping: mapping })
        }).then(function(r) { return r.json(); })
          .then(function(d) {
              btn.disabled = false;
              btn.textContent = type === 'defect' ? 'Import & Calculate' : 'Import Production Volume';
              if (d.ok) {
                  clearUpload(type);
                  tog(type === 'defect' ? 'pd' : 'pp');
                  var msg = 'Imported ' + d.imported + ' rows ✓';
                  if (d.skipped) {
                      msg += ' (' + d.skipped + ' skipped';
                      if (d.duplicates) msg += ', ' + d.duplicates + ' duplicate' + (d.duplicates !== 1 ? 's' : '');
                      msg += ')';
                  }
                  showToast(msg);
              } else {
                  showToast('Error: ' + d.error);
              }
          }).catch(function() {
              btn.disabled = false;
              btn.textContent = type === 'defect' ? 'Import & Calculate' : 'Import Production Volume';
              showToast('Network error');
          });
    };
    reader.readAsArrayBuffer(file);
}

function downloadTemplate(type) {
    var csv = type === 'defect'
        ? 'Customer,SerialNo,Model,DefectType,Component,DateTime,Side\nCUST-A,SN-001,MODEL-AA1,Solder Bridge,R1,04/07/2025 08:23:15,TOP'
        : 'Week,Customer,Model,Side,TotalInspected\n2026-W17,CUST-A,MODEL-AA1,TOP,520';
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = type === 'defect' ? 'defect_template.csv' : 'prodvol_template.csv';
    a.click();
}

function tog(id) {
    ['pd', 'pp', 'pr'].forEach(function(x) {
        var el = document.getElementById(x);
        if (el) el.style.display = (x === id) ? 'block' : 'none';
    });
}
