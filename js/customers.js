// ============================================
// customers.js — Customers, Models, and Complaints
// State lives in the module-level objects from auth.js (customers/models/
// complaints), synced in real time via the refs bound in ui.js's
// initListeners(). All writes go through /api/customers and /api/complaints.
//
// Note: this app no longer has a Task/Issue board (removed), so complaints
// are standalone — there's nothing left to link them to.
// ============================================

function fillCustomerSelect(selEl, placeholder) {
    if (!selEl) return;
    var current = selEl.value;
    var arr = customerArray().sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
    selEl.innerHTML = '<option value="">' + placeholder + '</option>' +
        arr.map(function(c) { return '<option value="' + c._id + '">' + esc(c.name) + '</option>'; }).join('');
    if (current && arr.some(function(c) { return c._id === current; })) selEl.value = current;
}

function fillModelSelect(selEl, customerId, placeholder) {
    if (!selEl) return;
    if (!customerId) {
        selEl.innerHTML = '<option value="">' + placeholder + '</option>';
        return;
    }
    var current = selEl.value;
    var arr = modelsForCustomer(customerId).sort(function(a, b) { return (a.code || '').localeCompare(b.code || ''); });
    selEl.innerHTML = '<option value="">— None —</option>' +
        arr.map(function(m) { return '<option value="' + m._id + '">' + esc(m.code) + (m.status === 'EOL' ? ' (EOL)' : '') + '</option>'; }).join('');
    if (current && arr.some(function(m) { return m._id === current; })) selEl.value = current;
}

// Called whenever customers/models change (from ui.js's initListeners) so
// every select stays in sync with the live data.
function populateCustomerSelects() {
    fillCustomerSelect(document.getElementById('cp-customer'), 'Select…');
    fillCustomerSelect(document.getElementById('cu-model-customer'), 'Select customer…');

    var cpCust = document.getElementById('cp-customer');
    fillModelSelect(document.getElementById('cp-model'), cpCust ? cpCust.value : '', 'Select customer first');
}

function updateComplaintSubmitState() {
    var btn = document.getElementById('cp-submit-btn');
    if (!btn) return;
    var customerId = document.getElementById('cp-customer').value;
    var modelId = document.getElementById('cp-model').value;
    var description = document.getElementById('cp-description').value.trim();
    btn.disabled = !(customerId && modelId && description);
}

function initCustomerForms() {
    // ── Complaint form: customer → model, enable/disable submit ─────────
    var cpCustomer = document.getElementById('cp-customer');
    if (cpCustomer) cpCustomer.addEventListener('change', function() {
        fillModelSelect(document.getElementById('cp-model'), cpCustomer.value, 'Select customer first');
        updateComplaintSubmitState();
    });
    var cpModel = document.getElementById('cp-model');
    if (cpModel) cpModel.addEventListener('change', updateComplaintSubmitState);
    var cpDescription = document.getElementById('cp-description');
    if (cpDescription) cpDescription.addEventListener('input', updateComplaintSubmitState);

    // ── Add Customer ──────────────────────────────────────────────────────
    var cuAddBtn = document.getElementById('cu-add-btn');
    if (cuAddBtn) cuAddBtn.addEventListener('click', function() {
        var nameEl = document.getElementById('cu-name');
        var name = nameEl.value.trim();
        if (!name) { showToast('Enter a customer name'); return; }
        if (!currentUser) { showToast('Not logged in'); return; }
        cuAddBtn.disabled = true;
        fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Badge': currentUser.badge },
            body: JSON.stringify({ action: 'addCustomer', name: name })
        }).then(function(r) { return r.json(); })
        .then(function(d) {
            cuAddBtn.disabled = false;
            if (d.ok) { nameEl.value = ''; showToast('Customer added \u2713'); }
            else showToast('Error: ' + d.error);
        }).catch(function() { cuAddBtn.disabled = false; showToast('Network error'); });
    });

    // ── Add Model ──────────────────────────────────────────────────────────
    var cuModelAddBtn = document.getElementById('cu-model-add-btn');
    if (cuModelAddBtn) cuModelAddBtn.addEventListener('click', function() {
        var customerId = document.getElementById('cu-model-customer').value;
        var codeEl = document.getElementById('cu-model-code');
        var code = codeEl.value.trim();
        if (!customerId) { showToast('Select a customer'); return; }
        if (!code) { showToast('Enter a model code'); return; }
        if (!currentUser) { showToast('Not logged in'); return; }
        cuModelAddBtn.disabled = true;
        fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Badge': currentUser.badge },
            body: JSON.stringify({ action: 'addModel', customerId: customerId, code: code })
        }).then(function(r) { return r.json(); })
        .then(function(d) {
            cuModelAddBtn.disabled = false;
            if (d.ok) { codeEl.value = ''; showToast('Model added \u2713'); }
            else showToast('Error: ' + d.error);
        }).catch(function() { cuModelAddBtn.disabled = false; showToast('Network error'); });
    });

    // ── Log Complaint ─────────────────────────────────────────────────────
    var cpSubmitBtn = document.getElementById('cp-submit-btn');
    if (cpSubmitBtn) cpSubmitBtn.addEventListener('click', function() {
        var customerId = document.getElementById('cp-customer').value;
        var modelId = document.getElementById('cp-model').value;
        var descEl = document.getElementById('cp-description');
        var description = descEl.value.trim();
        if (!customerId || !modelId || !description) return;
        if (!currentUser) { showToast('Not logged in'); return; }
        cpSubmitBtn.disabled = true;
        cpSubmitBtn.textContent = 'Logging…';
        fetch('/api/complaints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Badge': currentUser.badge },
            body: JSON.stringify({ action: 'add', customerId: customerId, modelId: modelId, description: description })
        }).then(function(r) { return r.json(); })
        .then(function(d) {
            cpSubmitBtn.textContent = 'Log Complaint →';
            if (d.ok) {
                descEl.value = '';
                updateComplaintSubmitState();
                showToast('Complaint logged \u2713');
            } else {
                cpSubmitBtn.disabled = false;
                showToast('Error: ' + d.error);
            }
        }).catch(function() {
            cpSubmitBtn.disabled = false;
            cpSubmitBtn.textContent = 'Log Complaint →';
            showToast('Network error');
        });
    });
}

// ─── CUSTOMERS VIEW ────────────────────────────────────────────────────────

function renderCustomers() {
    var list = document.getElementById('customers-list');
    if (!list) return;

    var arr = customerArray().sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
    if (!arr.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">🏭</div><div>No customers yet — add one above</div></div>';
        return;
    }

    var complaintArr = Object.keys(complaints).map(function(id) { return Object.assign({}, complaints[id], { _id: id }); });

    list.innerHTML = arr.map(function(c) {
        var custModels = modelsForCustomer(c._id).sort(function(a, b) { return (a.code || '').localeCompare(b.code || ''); });
        var openComplaints = complaintArr.filter(function(cm) { return cm.customerId === c._id && cm.status === 'Open'; }).length;

        var modelsHtml = custModels.length ? custModels.map(function(m) {
            var mComplaints = complaintArr.filter(function(cm) { return cm.modelId === m._id; }).length;
            return '<div class="model-row">' +
                '<div style="flex:1;min-width:0">' +
                '<span style="font-weight:600;color:var(--text);font-size:12px">' + esc(m.code) + '</span> ' +
                '<span class="badge badge-' + (m.status === 'Active' ? 'Resolved' : 'PendingParts') + '">' + m.status + '</span>' +
                '</div>' +
                '<div style="font-size:10px;color:var(--muted);white-space:nowrap">' +
                mComplaints + ' complaint' + (mComplaints !== 1 ? 's' : '') +
                '</div>' +
                '<button class="model-status-toggle" data-id="' + m._id + '" data-current="' + m.status + '">' +
                (m.status === 'Active' ? 'Mark EOL' : 'Mark Active') + '</button>' +
                '</div>';
        }).join('') : '<div style="padding:8px 4px;font-size:12px;color:var(--muted)">No models yet</div>';

        return '<div class="cu-card">' +
            '<div class="cu-header" data-id="' + c._id + '">' +
            '<div style="flex:1;min-width:0">' +
            '<div class="task-title">🏭 ' + esc(c.name) + ' <span class="toggle-arrow open">▶</span></div>' +
            '<div class="task-info">' +
            custModels.length + ' model' + (custModels.length !== 1 ? 's' : '') +
            (openComplaints ? ' \u00b7 ' + openComplaints + ' open complaint' + (openComplaints !== 1 ? 's' : '') : '') +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="cu-body open" id="cu-body-' + c._id + '">' + modelsHtml + '</div>' +
            '</div>';
    }).join('');

    // Expand/collapse — own class/listener, kept separate from any other
    // global click bindings.
    document.querySelectorAll('.cu-header').forEach(function(el) {
        el.addEventListener('click', function() {
            var id = el.getAttribute('data-id');
            var body = document.getElementById('cu-body-' + id);
            var arrow = el.querySelector('.toggle-arrow');
            if (body) { body.classList.toggle('open'); body.classList.toggle('collapsed'); }
            if (arrow) arrow.classList.toggle('open');
        });
    });

    // Toggle Active / EOL
    document.querySelectorAll('.model-status-toggle').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = btn.getAttribute('data-id');
            var next = btn.getAttribute('data-current') === 'Active' ? 'EOL' : 'Active';
            if (!currentUser) { showToast('Not logged in'); return; }
            fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Badge': currentUser.badge },
                body: JSON.stringify({ action: 'setModelStatus', modelId: id, status: next })
            }).then(function(r) { return r.json(); })
            .then(function(d) { showToast(d.ok ? d.msg : 'Error: ' + d.error); })
            .catch(function() { showToast('Network error'); });
        });
    });
}

// ─── COMPLAINTS VIEW ───────────────────────────────────────────────────────

function renderComplaints() {
    var list = document.getElementById('complaints-list');
    if (!list) return;

    var arr = Object.keys(complaints).map(function(id) { return Object.assign({}, complaints[id], { _id: id }); });
    if (!arr.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">📣</div><div>No complaints logged yet</div></div>';
        return;
    }
    arr.sort(function(a, b) { return (b.created || 0) - (a.created || 0); });

    list.innerHTML = arr.map(function(cm) {
        var dt = cm.created ? new Date(cm.created).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

        return '<div class="cu-card">' +
            '<div class="cu-header" style="cursor:default">' +
            '<div style="flex:1;min-width:0">' +
            '<div class="task-meta">' +
            '<span class="badge badge-line">' + esc(customerName(cm.customerId)) + '</span>' +
            '<span class="badge badge-model">' + esc(modelCode(cm.modelId)) + '</span>' +
            '</div>' +
            '<div class="task-title">📣 ' + esc(cm.description) + '</div>' +
            '<div class="task-info">🗓 ' + dt + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="cu-body open">' +
            '<div class="status-row">' +
            ['Open', 'Closed'].map(function(s) {
                var activeCls = cm.status === s ? (s === 'Closed' ? 'cp-active-closed' : 'cp-active-open') : '';
                return '<button class="cp-status-btn ' + activeCls + '" data-id="' + cm._id + '" data-status="' + s + '">' + s + '</button>';
            }).join('') +
            '</div>' +
            '</div>' +
            '</div>';
    }).join('');

    document.querySelectorAll('.cp-status-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = btn.getAttribute('data-id');
            var status = btn.getAttribute('data-status');
            if (!currentUser) { showToast('Not logged in'); return; }
            fetch('/api/complaints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Badge': currentUser.badge },
                body: JSON.stringify({ action: 'update', complaintId: id, status: status })
            }).then(function(r) { return r.json(); })
            .then(function(d) { showToast(d.ok ? d.msg : 'Error: ' + d.error); })
            .catch(function() { showToast('Network error'); });
        });
    });
}
