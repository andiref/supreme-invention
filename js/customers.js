// ============================================
// customers.js — Customers, Models, and Complaints
// State lives in the module-level objects from auth.js (customers/models/
// complaints), synced in real time via the refs bound in ui.js's
// initListeners(). All writes go through /api/customers and /api/complaints.
//
// Note: this app no longer has a Task/Issue board (removed), so complaints
// are standalone — there's nothing left to link them to.
// ============================================

// Which complaint (if any) currently has its 8D detail fields open for
// editing in the Complaints list. Null = nothing being edited.
var editingComplaintId = null;

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
    var finding = document.getElementById('cp-finding').value.trim();
    btn.disabled = !(customerId && modelId && finding);
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
    var cpFinding = document.getElementById('cp-finding');
    if (cpFinding) cpFinding.addEventListener('input', updateComplaintSubmitState);

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
            headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
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
            headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
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
        var findingEl = document.getElementById('cp-finding');
        var locationEl = document.getElementById('cp-location');
        var rcOccurrenceEl = document.getElementById('cp-rc-occurrence');
        var rcEscapeeEl = document.getElementById('cp-rc-escapee');
        var actionEl = document.getElementById('cp-action');
        var finding = findingEl.value.trim();
        if (!customerId || !modelId || !finding) return;
        if (!currentUser) { showToast('Not logged in'); return; }
        cpSubmitBtn.disabled = true;
        cpSubmitBtn.textContent = 'Logging…';
        fetch('/api/complaints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
            body: JSON.stringify({
                action: 'add', customerId: customerId, modelId: modelId,
                finding: finding,
                location: locationEl.value.trim(),
                rcOccurrence: rcOccurrenceEl.value.trim(),
                rcEscapee: rcEscapeeEl.value.trim(),
                correctiveAction: actionEl.value.trim()
            })
        }).then(function(r) { return r.json(); })
        .then(function(d) {
            cpSubmitBtn.textContent = 'Log Complaint →';
            if (d.ok) {
                findingEl.value = '';
                locationEl.value = '';
                rcOccurrenceEl.value = '';
                rcEscapeeEl.value = '';
                actionEl.value = '';
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
                headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
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
        // `description` is a fallback for complaints logged before the 8D
        // field upgrade — they only ever had that one field.
        var finding = cm.finding || cm.description || '';
        var isEditing = editingComplaintId === cm._id;

        var topHtml;
        if (isEditing) {
            topHtml =
                '<div class="form-group"><label>Finding *</label><textarea class="cp-edit-finding">' + esc(finding) + '</textarea></div>' +
                '<div class="form-group"><label>Location</label><input type="text" class="cp-edit-location" value="' + esc(cm.location || '') + '" /></div>' +
                '<div class="form-row">' +
                '<div class="form-group" style="margin-bottom:0"><label>Root Cause — Occurrence</label><textarea class="cp-edit-rc-occurrence">' + esc(cm.rcOccurrence || '') + '</textarea></div>' +
                '<div class="form-group" style="margin-bottom:0"><label>Root Cause — Escapee</label><textarea class="cp-edit-rc-escapee">' + esc(cm.rcEscapee || '') + '</textarea></div>' +
                '</div>' +
                '<div class="form-group"><label>Action</label><textarea class="cp-edit-action">' + esc(cm.correctiveAction || '') + '</textarea></div>';
        } else {
            topHtml =
                '<div class="task-title">📣 ' + esc(finding) + '</div>' +
                (cm.location ? '<div class="task-info">📍 ' + esc(cm.location) + '</div>' : '') +
                (cm.rcOccurrence ? '<div class="task-info"><b>RC — Occurrence:</b> ' + esc(cm.rcOccurrence) + '</div>' : '') +
                (cm.rcEscapee ? '<div class="task-info"><b>RC — Escapee:</b> ' + esc(cm.rcEscapee) + '</div>' : '') +
                (cm.correctiveAction ? '<div class="task-info"><b>Action:</b> ' + esc(cm.correctiveAction) + '</div>' : '') +
                '<div class="task-info">🗓 ' + dt + '</div>';
        }

        var bottomHtml;
        if (isEditing) {
            bottomHtml =
                '<div style="display:flex;gap:8px">' +
                '<button class="edit-btn cp-save-btn" data-id="' + cm._id + '">💾 Save</button>' +
                '<button class="cancel-edit-btn cp-cancel-btn" data-id="' + cm._id + '">✕ Cancel</button>' +
                '</div>';
        } else {
            bottomHtml =
                '<div class="status-row" style="align-items:center">' +
                ['Open', 'Closed'].map(function(s) {
                    var activeCls = cm.status === s ? (s === 'Closed' ? 'cp-active-closed' : 'cp-active-open') : '';
                    return '<button class="cp-status-btn ' + activeCls + '" data-id="' + cm._id + '" data-status="' + s + '">' + s + '</button>';
                }).join('') +
                '<button class="edit-btn cp-edit-toggle-btn" data-id="' + cm._id + '" style="margin-left:auto">✏️ Edit</button>' +
                '</div>';
        }

        return '<div class="cu-card">' +
            '<div class="cu-header" style="cursor:default">' +
            '<div style="flex:1;min-width:0">' +
            '<div class="task-meta">' +
            '<span class="badge badge-line">' + esc(customerName(cm.customerId)) + '</span>' +
            '<span class="badge badge-model">' + esc(modelCode(cm.modelId)) + '</span>' +
            '</div>' +
            topHtml +
            '</div>' +
            '</div>' +
            '<div class="cu-body open">' + bottomHtml + '</div>' +
            '</div>';
    }).join('');

    document.querySelectorAll('.cp-status-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = btn.getAttribute('data-id');
            var status = btn.getAttribute('data-status');
            if (!currentUser) { showToast('Not logged in'); return; }
            fetch('/api/complaints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
                body: JSON.stringify({ action: 'update', complaintId: id, status: status })
            }).then(function(r) { return r.json(); })
            .then(function(d) { showToast(d.ok ? d.msg : 'Error: ' + d.error); })
            .catch(function() { showToast('Network error'); });
        });
    });

    document.querySelectorAll('.cp-edit-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            editingComplaintId = btn.getAttribute('data-id');
            renderComplaints();
        });
    });

    document.querySelectorAll('.cp-cancel-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            editingComplaintId = null;
            renderComplaints();
        });
    });

    document.querySelectorAll('.cp-save-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = btn.getAttribute('data-id');
            var card = btn.closest('.cu-card');
            var finding = card.querySelector('.cp-edit-finding').value.trim();
            var location = card.querySelector('.cp-edit-location').value.trim();
            var rcOccurrence = card.querySelector('.cp-edit-rc-occurrence').value.trim();
            var rcEscapee = card.querySelector('.cp-edit-rc-escapee').value.trim();
            var correctiveAction = card.querySelector('.cp-edit-action').value.trim();
            if (!finding) { showToast('Finding cannot be empty'); return; }
            if (!currentUser) { showToast('Not logged in'); return; }
            btn.disabled = true;
            btn.textContent = 'Saving…';
            fetch('/api/complaints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
                body: JSON.stringify({
                    action: 'update', complaintId: id,
                    finding: finding, location: location,
                    rcOccurrence: rcOccurrence, rcEscapee: rcEscapee, correctiveAction: correctiveAction
                })
            }).then(function(r) { return r.json(); })
            .then(function(d) {
                if (d.ok) {
                    editingComplaintId = null;
                    showToast('Complaint updated \u2713');
                    // The realtime listener will also re-render once the write
                    // lands, but do it now too so the edit form closes right away.
                    renderComplaints();
                } else {
                    btn.disabled = false;
                    btn.textContent = '💾 Save';
                    showToast('Error: ' + d.error);
                }
            }).catch(function() {
                btn.disabled = false;
                btn.textContent = '💾 Save';
                showToast('Network error');
            });
        });
    });
}
