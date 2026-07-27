// ─── INIT APP ──────────────────────────────────────────────────────
        var appInitialized = false;
        function initApp() {
            initListeners();
            initNav();
            initCustomerForms();
            initThemeToggles();
            updateHeader();
            setInterval(updateHeader, 60000);
            // Canvas chart text is drawn synchronously, so it may render with
            // a fallback font for one frame while Inter is still loading.
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(function() {
                    if (typeof renderAll === 'function') renderAll();
                });
            }
        }

        // ─── FIREBASE LISTENERS ─────────────────────────────────────────────
        // Connection state monitoring
        db.ref('.info/connected').on('value', function(snap) {
            var connected = snap.val();
            var dd = document.getElementById('sync-dot');
            var dl = document.getElementById('sync-label');
            var md = document.getElementById('sync-dot-mobile');
            var ml = document.getElementById('sync-label-mobile');
            if (connected) {
                if (dd) dd.className = 'sync-dot live';
                if (dl) dl.textContent = 'Live — synced';
                if (md) md.className = 'sync-dot live';
                if (ml) ml.textContent = 'Live — synced';
            } else {
                if (dd) dd.className = 'sync-dot error';
                if (dl) dl.textContent = 'Offline — changes queued locally';
                if (md) md.className = 'sync-dot error';
                if (ml) ml.textContent = 'Offline — changes queued locally';
            }
        });

        function setSyncStatus(live, msg, time) {
            // Desktop sync bar
            var dd = document.getElementById('sync-dot');
            var dl = document.getElementById('sync-label');
            var dt = document.getElementById('sync-time');
            if (dd) dd.className = 'sync-dot' + (live ? ' live' : ' error');
            if (dl) dl.textContent = msg;
            if (dt && time) dt.textContent = time;
            // Mobile sync bar
            var md = document.getElementById('sync-dot-mobile');
            var ml = document.getElementById('sync-label-mobile');
            var mt = document.getElementById('sync-time-mobile');
            if (md) md.className = 'sync-dot' + (live ? ' live' : ' error');
            if (ml) ml.textContent = msg;
            if (mt && time) mt.textContent = time;
        }

        function initListeners() {
            function safeOnValue(ref, callback, errorCallback, retries) {
                retries = retries || 3;
                ref.on('value', callback, function(err) {
                    console.error('Firebase error:', err);
                    // Don't retry permission errors — retrying won't help and causes error loops
                    var isPermissionError = err && err.code && err.code.indexOf('PERMISSION_DENIED') !== -1;
                    if (!isPermissionError && retries > 0) {
                        setTimeout(function() {
                            safeOnValue(ref, callback, errorCallback, retries - 1);
                        }, 2000);
                    } else if (errorCallback) {
                        errorCallback(err);
                    } else if (isPermissionError) {
                        console.warn('Permission denied — check Firebase Rules and Anonymous Auth is enabled.');
                    }
                });
            }

            safeOnValue(customersRef, function(snap) {
                customers = snap.val() || {};
                populateCustomerSelects();
                if (currentView === 'customers') renderCustomers();
                setSyncStatus(true, 'Live — synced',
                    'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }, function(err) {
                setSyncStatus(false, 'Error: ' + err.message, null);
            });
            safeOnValue(modelsRef, function(snap) {
                models = snap.val() || {};
                populateCustomerSelects();
                if (currentView === 'customers') renderCustomers();
            });
            safeOnValue(complaintsRef.orderByChild('created').limitToLast(200), function(snap) {
                complaints = snap.val() || {};
                if (currentView === 'complaints') renderComplaints();
            });

            // ── Yield/DPPM analytics tool (js/yield.js) ──────────────────────
            safeOnValue(defectsRef, function(snap) {
                var raw = snap.val() || {};
                // Reconstruct full rows (week/hour/shift/dow/datetime) from the
                // 7 stored fields via mkRow(), same as the original tool's
                // loadData() did from localStorage.
                rawDef = Object.keys(raw).map(function(id) {
                    var r = raw[id];
                    return mkRow(r.dtStr, r.customer, r.model, r.sn, r.side, r.comp, r.defect);
                }).filter(Boolean);
                if (currentView === 'yield') { populateFilters(); renderYield(); }
                if (currentView === 'time') { populateTimeFilters(); renderTime(); }
                if (currentView === 'report') { populateRptFilter(); renderReport(); }
            });
            safeOnValue(prodVolRef, function(snap) {
                var raw = snap.val() || {};
                prodVol = Object.keys(raw).map(function(id) {
                    var r = raw[id];
                    return { week: r.week, customer: r.customer, model: r.model, inspTOP: r.inspTOP || 0, inspBOT: r.inspBOT || 0 };
                });
                if (currentView === 'yield') { populateFilters(); renderYield(); }
            });
            safeOnValue(modelTiersRef, function(snap) {
                var raw = snap.val() || {};
                modelTiers = Object.keys(raw).map(function(id) {
                    return Object.assign({}, raw[id], { _id: id });
                });
                if (currentView === 'tiers') renderTiers();
            });
        }

        // ─── SHOW CONFIRM ────────────────────────────────────────────────────
        function showConfirm(title, msg, onYes, yesLabel) {
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-msg').textContent = msg || '';
            document.getElementById('confirm-yes').textContent = yesLabel || 'Confirm';
            document.getElementById('confirm-overlay').classList.add('show');
            confirmCallback = onYes;
        }

        document.getElementById('confirm-yes').addEventListener('click', function() {
            document.getElementById('confirm-overlay').classList.remove('show');
            if (confirmCallback) confirmCallback();
            confirmCallback = null;
        });
        document.getElementById('confirm-no').addEventListener('click', function() {
            document.getElementById('confirm-overlay').classList.remove('show');
            confirmCallback = null;
        });

        // ─── NAV ─────────────────────────────────────────────────────────────
        function initNav() {
            var navBtns = {
                'btn-customers': 'customers',
                'btn-complaints': 'complaints',
                'btn-yield': 'yield',
                'btn-time': 'time',
                'btn-tiers': 'tiers',
                'btn-library': 'library',
                'btn-report': 'report'
            };
            Object.keys(navBtns).forEach(function(id) {
                var btn = document.getElementById(id);
                if (!btn) return;
                btn.addEventListener('click', function() {
                    switchView(navBtns[id]);
                });
            });

            // Sidebar nav buttons
            document.querySelectorAll('#sidebar-nav .snav-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var target = btn.getAttribute('data-target');
                    if (target && navBtns[target]) switchView(navBtns[target]);
                });
            });
            // Sidebar logout
            var sLogout = document.getElementById('sidebar-logout-btn2');
            if (sLogout) sLogout.addEventListener('click', logout);

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    document.getElementById('confirm-overlay').classList.remove('show');
                }
            });
        }

        function switchView(v) {
            currentView = v;
            var viewToBtn = {
                customers: 'btn-customers', complaints: 'btn-complaints',
                yield: 'btn-yield', time: 'btn-time', tiers: 'btn-tiers',
                library: 'btn-library', report: 'btn-report'
            };
            var allViews = ['customers', 'complaints', 'yield', 'time', 'tiers', 'library', 'report'];
            allViews.forEach(function(name) {
                var btn = document.getElementById('btn-' + name);
                if (btn) btn.classList.toggle('active', name === v);
            });
            // Sidebar active state
            document.querySelectorAll('#sidebar-nav .snav-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-target') === viewToBtn[v]);
            });
            document.getElementById('customers-view').style.display = v === 'customers' ? 'block' : 'none';
            document.getElementById('complaints-view').style.display = v === 'complaints' ? 'block' : 'none';
            document.getElementById('tab-yield').style.display = v === 'yield' ? 'block' : 'none';
            document.getElementById('tab-time').style.display = v === 'time' ? 'block' : 'none';
            document.getElementById('tab-tiers').style.display = v === 'tiers' ? 'block' : 'none';
            document.getElementById('tab-library').style.display = v === 'library' ? 'block' : 'none';
            document.getElementById('tab-report').style.display = v === 'report' ? 'block' : 'none';

            if (v === 'customers') renderCustomers();
            if (v === 'complaints') renderComplaints();
            if (v === 'yield') { populateFilters(); renderYield(); }
            if (v === 'time') { populateTimeFilters(); renderTime(); }
            if (v === 'tiers') renderTiers();
            if (v === 'library') renderLib();
            if (v === 'report') { populateRptFilter(); renderReport(); }
            applyRoleUI();
        }

        // ─── RENDER ALL ──────────────────────────────────────────────────────
        function renderAll() {
            updateHeader();
            if (currentView === 'customers') renderCustomers();
            if (currentView === 'complaints') renderComplaints();
            if (currentView === 'yield') renderYield();
            if (currentView === 'time') renderTime();
            if (currentView === 'tiers') renderTiers();
            if (currentView === 'library') renderLib();
            if (currentView === 'report') renderReport();
            applyRoleUI();
        }

        // ─── UPDATE HEADER ──────────────────────────────────────────────────
        // Trimmed down to just the date/shift label — the open/done/critical
        // counts and line-status grid were all Task-board derived and went
        // away with it.
        function updateHeader() {
            var now = new Date();
            var dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            var shiftStr = getShift() + ' · ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            document.getElementById('date-label').textContent = dateStr;
            document.getElementById('shift-label').textContent = shiftStr;
            var ssl = document.getElementById('sidebar-shift-label');
            if (ssl) ssl.textContent = shiftStr;
            var sdl = document.getElementById('sidebar-date-label');
            if (sdl) sdl.textContent = dateStr;
        }
