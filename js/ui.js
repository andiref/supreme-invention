/* ═══════════════════════════════════════════════════════════
   UI CONTROLLER
   Boots once, right after a successful login (auth.js calls
   initApp() from loginSuccess()). Owns: view switching + nav
   highlighting, the live Firebase → state sync, the header
   clock, and the online/offline toast.
   Login, session persistence, theme, and logout all live in
   auth.js — this file doesn't duplicate any of that.
   ═══════════════════════════════════════════════════════════ */

function initApp() {
    initListeners();
    initCustomerForms();
    initThemeToggles();
    initUpload('defect');
    initUpload('prod');
    updateHeader();
    setInterval(updateHeader, 60000);
    loadFirebaseData();
}

function initListeners() {
    window.addEventListener('online', function() { showToast('Back online'); });
    window.addEventListener('offline', function() { showToast('Offline mode'); });
}

function viewVisible(view) {
    var el = document.getElementById('view-' + view);
    return !!(el && !el.classList.contains('hidden'));
}

function switchView(view) {
    document.querySelectorAll('.view').forEach(function(v) { v.classList.add('hidden'); });
    var target = document.getElementById('view-' + view);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('#nav .nav-btn').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-view') === view);
    });

    var title = document.getElementById('page-title');
    if (title) title.textContent = view.charAt(0).toUpperCase() + view.slice(1);

    if (view === 'customers') { populateCustomerSelects(); renderCustomers(); }
    if (view === 'complaints') { populateCustomerSelects(); renderComplaints(); }
    if (view === 'yield') renderYield();
    if (view === 'dashboard') renderDashboard();
}

// Called by auth.js's loginSuccess() (initial load) and toggleTheme()
// (canvas charts need a repaint after a theme change).
function renderAll() {
    populateCustomerSelects();
    renderCustomers();
    renderComplaints();
    renderDashboard();
    if (viewVisible('yield')) renderYield();
}

// ─── DASHBOARD ──────────────────────────────────────────────────────
function renderDashboard() {
    var cardsEl = document.getElementById('dash-cards');
    var recentEl = document.getElementById('dash-recent');
    if (!cardsEl || !recentEl) return;

    var custArr = customerArray();
    var modArr = modelArray();
    var complaintArr = Object.keys(complaints).map(function(id) {
        return Object.assign({}, complaints[id], { _id: id });
    });
    var openCount = complaintArr.filter(function(c) { return c.status !== 'Closed'; }).length;

    cardsEl.innerHTML =
        '<div class="card"><div class="card-label">Customers</div><div class="card-value">' + custArr.length + '</div></div>' +
        '<div class="card"><div class="card-label">Models</div><div class="card-value">' + modArr.length + '</div></div>' +
        '<div class="card"><div class="card-label">Open Complaints</div><div class="card-value">' + openCount + '</div></div>' +
        '<div class="card"><div class="card-label">Total Complaints</div><div class="card-value">' + complaintArr.length + '</div></div>';

    if (!complaintArr.length) {
        recentEl.innerHTML = '<div class="empty"><div class="empty-icon">📣</div><div>No complaints logged yet</div></div>';
        return;
    }

    complaintArr.sort(function(a, b) { return (b.created || 0) - (a.created || 0); });

    recentEl.innerHTML = complaintArr.slice(0, 5).map(function(cm) {
        var dt = cm.created ? new Date(cm.created).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        var finding = cm.finding || cm.description || '';
        return '<div class="cu-card"><div class="cu-header" style="cursor:default"><div style="flex:1;min-width:0">' +
            '<div class="task-meta">' +
            '<span class="badge badge-line">' + esc(customerName(cm.customerId)) + '</span>' +
            '<span class="badge badge-model">' + esc(modelCode(cm.modelId)) + '</span>' +
            '<span class="badge badge-' + (cm.status === 'Closed' ? 'Resolved' : 'Open') + '">' + esc(cm.status || 'Open') + '</span>' +
            '</div>' +
            '<div class="task-title">📣 ' + esc(finding) + '</div>' +
            '<div class="task-info">🗓 ' + dt + '</div>' +
            '</div></div></div>';
    }).join('');
}

// ─── LIVE FIREBASE SYNC ─────────────────────────────────────────────
// customers/models/complaints stay as Firebase-ID-keyed objects here
// (matching auth.js's customerArray()/customerName()/modelCode()/
// modelsForCustomer() and customers.js's renderCustomers()/
// renderComplaints(), which all do Object.keys(...) lookups on them).
// rawDef/prodVol/modelTiers stay as plain arrays for yield.js.
function loadFirebaseData() {
    var db = firebase.database();

    safeOnValue(db.ref('smt_customers'), function(snap) {
        customers = snap.val() || {};
        populateCustomerSelects();
        if (viewVisible('customers')) renderCustomers();
        if (viewVisible('dashboard')) renderDashboard();
    });

    safeOnValue(db.ref('smt_models'), function(snap) {
        models = snap.val() || {};
        populateCustomerSelects();
        if (viewVisible('customers')) renderCustomers();
        if (viewVisible('yield')) renderYield();
    });

    safeOnValue(db.ref('smt_complaints'), function(snap) {
        complaints = snap.val() || {};
        if (viewVisible('complaints')) renderComplaints();
        if (viewVisible('customers')) renderCustomers();
        if (viewVisible('dashboard')) renderDashboard();
    });

    safeOnValue(db.ref('smt_defects'), function(snap) {
        var val = snap.val() || {};
        rawDef = Object.keys(val).map(function(k) { return val[k]; });
        if (viewVisible('yield')) renderYield();
    });

    safeOnValue(db.ref('smt_prodvol'), function(snap) {
        var val = snap.val() || {};
        prodVol = Object.keys(val).map(function(k) { return Object.assign({}, val[k], { _id: k }); });
    });

    safeOnValue(db.ref('smt_modeltiers'), function(snap) {
        var val = snap.val() || {};
        modelTiers = Object.keys(val).map(function(k) { return Object.assign({}, val[k], { _id: k }); });
    });
}

// Detaches the listener before retrying, to avoid piling up duplicate
// handlers on the same ref across retries.
function safeOnValue(ref, callback, errorCallback, retries) {
    retries = retries || 3;
    var handler = function(snap) { callback(snap); };
    var errorHandler = function(err) {
        console.error('Firebase read error:', err);
        ref.off('value', handler);
        if (errorCallback) errorCallback(err);
        if (retries > 0) {
            setTimeout(function() {
                safeOnValue(ref, callback, errorCallback, retries - 1);
            }, 2000);
        }
    };
    ref.on('value', handler, errorHandler);
}

function updateHeader() {
    var extra = document.getElementById('header-extra');
    if (!extra) return;
    var now = new Date();
    extra.textContent = now.toLocaleDateString() + ' · ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
