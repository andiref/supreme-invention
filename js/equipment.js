// ============================================
// equipment.js — Equipment part follow-up tracker
// Replaces customers.js (Customers/Complaints removed). State lives in the
// module-level `equipment` object from auth.js, synced in real time via
// equipmentRef bound in ui.js's initListeners(). All writes go through
// /api/equipment.
// ============================================

// Which equipment item (if any) currently has its fields open for editing
// in the list. Null = nothing being edited.
var editingEquipmentId = null;

var EQ_STATUSES = ['Requested', 'Ordered', 'In Transit', 'Received', 'Installed', 'Cancelled'];

function eqStatusColor(status) {
    return {
        'Requested': '#64748b',
        'Ordered': '#3b82f6',
        'In Transit': '#f59e0b',
        'Received': '#a78bfa',
        'Installed': '#22c55e',
        'Cancelled': '#ef4444'
    }[status] || '#64748b';
}

function eqPriorityColor(priority) {
    return { 'Low': '#22c55e', 'Medium': '#f59e0b', 'High': '#ef4444' }[priority] || '#f59e0b';
}

function initEquipmentForms() {
    // ── Add Part ─────────────────────────────────────────────────────────
    var eqAddBtn = document.getElementById('eq-add-btn');
    if (eqAddBtn) eqAddBtn.addEventListener('click', function() {
        var partEl = document.getElementById('eq-part');
        var machineEl = document.getElementById('eq-machine');
        var priorityEl = document.getElementById('eq-priority');
        var notesEl = document.getElementById('eq-notes');
        var partName = partEl.value.trim();
        var equipment = machineEl.value.trim();
        if (!partName) { showToast('Enter a part name'); return; }
        if (!equipment) { showToast('Enter the equipment/machine'); return; }
        if (!currentUser) { showToast('Not logged in'); return; }
        eqAddBtn.disabled = true;
        fetch('/api/equipment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
            body: JSON.stringify({
                action: 'add', partName: partName, equipment: equipment,
                priority: priorityEl.value, notes: notesEl.value.trim()
            })
        }).then(function(r) { return r.json(); })
        .then(function(d) {
            eqAddBtn.disabled = false;
            if (d.ok) {
                partEl.value = ''; machineEl.value = ''; notesEl.value = '';
                priorityEl.value = 'Medium';
                showToast('Part added \u2713');
            } else showToast('Error: ' + d.error);
        }).catch(function() { eqAddBtn.disabled = false; showToast('Network error'); });
    });
}

// ─── EQUIPMENT VIEW ─────────────────────────────────────────────────────────

function renderEquipment() {
    var list = document.getElementById('equipment-list');
    if (!list) return;

    var arr = Object.keys(equipment).map(function(id) { return Object.assign({}, equipment[id], { _id: id }); });
    if (!arr.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">🔧</div><div>No parts logged yet — add one above</div></div>';
        return;
    }

    // Active follow-ups first (High priority, then oldest-first so nothing
    // gets forgotten), Installed/Cancelled sink to the bottom.
    var prioRank = { High: 0, Medium: 1, Low: 2 };
    var doneStates = ['Installed', 'Cancelled'];
    arr.sort(function(a, b) {
        var aDone = doneStates.indexOf(a.status) !== -1;
        var bDone = doneStates.indexOf(b.status) !== -1;
        if (aDone !== bDone) return aDone ? 1 : -1;
        if (aDone && bDone) return (b.updated || 0) - (a.updated || 0);
        var pr = (prioRank[a.priority] || 1) - (prioRank[b.priority] || 1);
        if (pr !== 0) return pr;
        return (a.created || 0) - (b.created || 0);
    });

    list.innerHTML = arr.map(function(eq) {
        var dt = eq.created ? new Date(eq.created).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        var isEditing = editingEquipmentId === eq._id;
        var isDone = doneStates.indexOf(eq.status) !== -1;

        var topHtml;
        if (isEditing) {
            topHtml =
                '<div class="form-row">' +
                '<div class="form-group" style="margin-bottom:0"><label>Part Name *</label><input type="text" class="eq-edit-part" value="' + esc(eq.partName) + '" /></div>' +
                '<div class="form-group" style="margin-bottom:0"><label>Equipment/Machine *</label><input type="text" class="eq-edit-machine" value="' + esc(eq.equipment) + '" /></div>' +
                '</div>' +
                '<div class="form-group"><label>Priority</label><select class="eq-edit-priority">' +
                ['Low', 'Medium', 'High'].map(function(p) { return '<option' + (p === eq.priority ? ' selected' : '') + '>' + p + '</option>'; }).join('') +
                '</select></div>' +
                '<div class="form-group"><label>Notes</label><textarea class="eq-edit-notes">' + esc(eq.notes || '') + '</textarea></div>';
        } else {
            topHtml =
                '<div class="task-title">🔧 ' + esc(eq.partName) + '</div>' +
                '<div class="task-meta">' +
                '<span class="badge badge-line">' + esc(eq.equipment) + '</span>' +
                '<span class="badge" style="background:' + eqPriorityColor(eq.priority) + '20;border:1px solid ' + eqPriorityColor(eq.priority) + '40;color:' + eqPriorityColor(eq.priority) + ';">' + esc(eq.priority) + '</span>' +
                '<span class="badge" style="background:' + eqStatusColor(eq.status) + '20;border:1px solid ' + eqStatusColor(eq.status) + '40;color:' + eqStatusColor(eq.status) + ';">' + esc(eq.status) + '</span>' +
                '</div>' +
                (eq.notes ? '<div class="task-info">📝 ' + esc(eq.notes) + '</div>' : '') +
                '<div class="task-info">🗓 Requested ' + dt + (eq.requestedBy ? ' \u00b7 ' + esc(eq.requestedBy) : '') + '</div>';
        }

        var bottomHtml;
        if (isEditing) {
            bottomHtml =
                '<div style="display:flex;gap:8px">' +
                '<button class="edit-btn eq-save-btn" data-id="' + eq._id + '">💾 Save</button>' +
                '<button class="cancel-edit-btn eq-cancel-btn" data-id="' + eq._id + '">✕ Cancel</button>' +
                '</div>';
        } else {
            bottomHtml =
                '<div class="status-row" style="align-items:center;flex-wrap:wrap;gap:8px;">' +
                '<select class="eq-status-select" data-id="' + eq._id + '" style="width:auto;font-size:11px;' +
                (isDone ? 'opacity:0.7;' : '') + '">' +
                EQ_STATUSES.map(function(s) { return '<option' + (s === eq.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
                '</select>' +
                '<button class="edit-btn eq-edit-toggle-btn" data-id="' + eq._id + '">✏️ Edit</button>' +
                '<button class="edit-btn eq-delete-btn" data-id="' + eq._id + '" style="margin-left:auto;color:#ef4444;">🗑 Delete</button>' +
                '</div>';
        }

        return '<div class="cu-card">' +
            '<div class="cu-header" style="cursor:default">' +
            '<div style="flex:1;min-width:0">' +
            topHtml +
            '</div>' +
            '</div>' +
            '<div class="cu-body open">' + bottomHtml + '</div>' +
            '</div>';
    }).join('');

    document.querySelectorAll('.eq-status-select').forEach(function(sel) {
        sel.addEventListener('change', function() {
            var id = sel.getAttribute('data-id');
            if (!currentUser) { showToast('Not logged in'); return; }
            fetch('/api/equipment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
                body: JSON.stringify({ action: 'update', id: id, status: sel.value })
            }).then(function(r) { return r.json(); })
            .then(function(d) { showToast(d.ok ? 'Status updated \u2713' : 'Error: ' + d.error); })
            .catch(function() { showToast('Network error'); });
        });
    });

    document.querySelectorAll('.eq-edit-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            editingEquipmentId = btn.getAttribute('data-id');
            renderEquipment();
        });
    });

    document.querySelectorAll('.eq-cancel-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            editingEquipmentId = null;
            renderEquipment();
        });
    });

    document.querySelectorAll('.eq-save-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = btn.getAttribute('data-id');
            var card = btn.closest('.cu-card');
            var partName = card.querySelector('.eq-edit-part').value.trim();
            var machine = card.querySelector('.eq-edit-machine').value.trim();
            var priority = card.querySelector('.eq-edit-priority').value;
            var notes = card.querySelector('.eq-edit-notes').value.trim();
            if (!partName) { showToast('Part name cannot be empty'); return; }
            if (!machine) { showToast('Equipment/machine cannot be empty'); return; }
            if (!currentUser) { showToast('Not logged in'); return; }
            btn.disabled = true;
            btn.textContent = 'Saving…';
            fetch('/api/equipment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
                body: JSON.stringify({ action: 'update', id: id, partName: partName, equipment: machine, priority: priority, notes: notes })
            }).then(function(r) { return r.json(); })
            .then(function(d) {
                if (d.ok) {
                    editingEquipmentId = null;
                    showToast('Updated \u2713');
                    renderEquipment();
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

    document.querySelectorAll('.eq-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = btn.getAttribute('data-id');
            showConfirm('Remove this part?', 'This cannot be undone.', function() {
                if (!currentUser) { showToast('Not logged in'); return; }
                fetch('/api/equipment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
                    body: JSON.stringify({ action: 'delete', id: id })
                }).then(function(r) { return r.json(); })
                .then(function(d) { showToast(d.ok ? 'Removed' : 'Error: ' + d.error); })
                .catch(function() { showToast('Network error'); });
            }, 'Remove \uD83D\uDDD1\uFE0F');
        });
    });
}
