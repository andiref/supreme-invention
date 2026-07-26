// ─── STATE ──────────────────────────────────────────────────────────
        var currentUser = null;
        var customers = {};
        var models = {};
        var complaints = {};
        var currentView = 'customers';
        var toastTimer;
        var confirmCallback = null;

        // ─── SESSION PERSISTENCE ──────────────────────────────────────────
        var SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours (one shift)

        function saveUser(user) {
            try { localStorage.setItem('smt_user', JSON.stringify({ _ts: Date.now(), data: user })); } catch (e) {}
        }

        function loadStoredUser() {
            try {
                var raw = localStorage.getItem('smt_user');
                if (raw) {
                    var stored = JSON.parse(raw);
                    // Support legacy format (no _ts wrapper)
                    var user = stored._ts ? stored.data : stored;
                    var ts   = stored._ts || 0;
                    if (stored._ts && Date.now() - ts > SESSION_TTL_MS) {
                        localStorage.removeItem('smt_user');
                        return null;
                    }
                    if (user && user.name && user.badge) {
                        return user;
                    }
                }
            } catch (e) {}
            return null;
        }

        function clearStoredUser() {
            try { localStorage.removeItem('smt_user'); } catch (e) {}
        }

        // ─── THEME ───────────────────────────────────────────────────────────
        var themeToggleBtns = [];
        function applyTheme(light) {
            document.body.classList.toggle('light', !!light);
            var icon  = light ? '☀️' : '🌙';
            var label = light ? '☀️ Light mode' : '🌙 Dark mode';
            var mobile  = document.getElementById('theme-toggle-mobile');
            var desktop = document.getElementById('theme-toggle-desktop');
            var sidebar = document.getElementById('theme-toggle-sidebar');
            if (mobile)  mobile.textContent  = icon;
            if (desktop) desktop.textContent = icon;
            if (sidebar) sidebar.textContent = label;
            try { localStorage.setItem('smt_theme', light ? 'light' : 'dark'); } catch(e) {}
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', light ? '#f0f2f8' : '#0a0a0f');
        }
        function toggleTheme() {
            applyTheme(!document.body.classList.contains('light'));
        }
        // Apply saved preference immediately on load
        (function() {
            try {
                var saved = localStorage.getItem('smt_theme');
                if (saved === 'light') applyTheme(true);
            } catch(e) {}
        })();
        // Wire buttons after DOM ready (initThemeToggles called from initApp)
        function initThemeToggles() {
            themeToggleBtns = [
                document.getElementById('theme-toggle-mobile'),
                document.getElementById('theme-toggle-desktop'),
                document.getElementById('theme-toggle-sidebar')
            ];
            themeToggleBtns.forEach(function(btn) {
                if (btn) btn.addEventListener('click', toggleTheme);
            });
            // Set initial label
            applyTheme(document.body.classList.contains('light'));
        }

        // ─── HELPERS ─────────────────────────────────────────────────────────
        function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;'); }

        function getShift() {
            var h = new Date().getHours();
            if (h >= 7 && h < 15) return 'Shift 1 (7AM-3PM)';
            if (h >= 15 && h < 23) return 'Shift 2 (3PM-11PM)';
            return 'Shift 3 (11PM-7AM)';
        }

        // ─── CUSTOMER / MODEL LOOKUPS ───────────────────────────────────────
        function customerArray() {
            return Object.keys(customers).map(function(id) { return Object.assign({}, customers[id], { _id: id }); });
        }
        function modelArray() {
            return Object.keys(models).map(function(id) { return Object.assign({}, models[id], { _id: id }); });
        }
        function modelsForCustomer(customerId) {
            return modelArray().filter(function(m) { return m.customerId === customerId; });
        }
        function customerName(id) {
            return (id && customers[id]) ? customers[id].name : '';
        }
        function modelCode(id) {
            return (id && models[id]) ? models[id].code : '';
        }

        function fmtDate(ts) {
            if (!ts) return '';
            return new Date(ts).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
                minute: '2-digit' });
        }

        function showToast(msg) {
            var el = document.getElementById('toast');
            if (!el) return;
            el.textContent = msg;
            el.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function() { el.classList.remove('show'); }, 2000);
        }

        // ─── ROLE HELPERS ────────────────────────────────────────────────────
        // Kept for /api/* auth (server-side role is still recorded on the
        // user account) even though nothing in this trimmed-down app gates
        // UI on role anymore — it's just you.
        function getRole() { return currentUser ? currentUser.role : 'technician'; }
        function isAdmin() { return getRole() === 'admin'; }

        // ─── DOM REFS ──────────────────────────────────────────────────────
        var loginOverlay = document.getElementById('login-overlay');
        var loginForm = document.getElementById('login-form');
        var loginName = document.getElementById('login-name');
        var loginBadge = document.getElementById('login-badge');
        var loginBtn = document.getElementById('login-btn');
        var loginError = document.getElementById('login-error');
        var createAdminSection = document.getElementById('create-admin-section');
        var createAdminName = document.getElementById('create-admin-name');
        var createAdminBadge = document.getElementById('create-admin-badge');
        var createAdminBtn = document.getElementById('create-admin-btn');
        var createAdminError = document.getElementById('create-admin-error');

        var app = document.getElementById('app');
        var userAvatar = document.getElementById('user-avatar');
        var userNameTag = document.getElementById('user-name-tag');
        var logoutBtnVisible = document.getElementById('logout-btn-visible');

        // ─── FIREBASE REFERENCES ────────────────────────────────────────────
        // Note: there is no client-side `usersRef` — user accounts go through
        // /api/users (functions/api/users.js). Firebase rules deny direct
        // client read/write on `/users` entirely.
        var customersRef = db.ref('smt_customers');
        var modelsRef = db.ref('smt_models');
        var complaintsRef = db.ref('smt_complaints');
        var defectsRef = db.ref('smt_defects');
        var prodVolRef = db.ref('smt_prodvol');
        var modelTiersRef = db.ref('smt_modeltiers');

        // ─── CHECK USERS ──────────────────────────────────────────────────
        function checkUsersExist() {
            fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'exists' })
            }).then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.ok && data.exists) {
                    createAdminSection.classList.remove('show');
                    loginForm.style.display = '';
                } else {
                    createAdminSection.classList.add('show');
                    loginForm.style.display = 'none';
                }
            }).catch(function(err) {
                console.error('checkUsersExist error:', err);
                // Fail safe: show the normal login form rather than an
                // open "create admin" prompt if the check itself fails.
                createAdminSection.classList.remove('show');
                loginForm.style.display = '';
            });
        }

        // ─── LOGIN / CREATE ADMIN ──────────────────────────────────────────
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var name = loginName.value.trim();
            var badge = loginBadge.value.trim();
            if (!name || !badge) { loginError.textContent = 'Please enter name and badge.'; return; }
            loginError.textContent = '';
            loginBtn.disabled = true;
            loginBtn.textContent = '…';

            fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'login', name: name, badge: badge })
            }).then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.ok) {
                    currentUser = { badge: data.user.badge, name: data.user.name, role: data.user.role || 'technician' };
                    loginSuccess();
                } else {
                    loginError.textContent = data.error || 'Invalid name or badge.';
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Sign In →';
                }
            }).catch(function(err) {
                loginError.textContent = 'Network error — try again.';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In →';
            });
        });

        createAdminBtn.addEventListener('click', function() {
            var name = createAdminName.value.trim();
            var badge = createAdminBadge.value.trim();
            if (!name || !badge) { createAdminError.textContent = 'Both fields required.'; return; }
            createAdminError.textContent = '';
            createAdminBtn.disabled = true;
            createAdminBtn.textContent = 'Creating…';

            fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'bootstrap-admin', name: name, badge: badge })
            }).then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.ok) {
                    currentUser = { badge: data.user.badge, name: data.user.name, role: data.user.role || 'admin' };
                    loginSuccess();
                } else {
                    createAdminError.textContent = data.error || 'Could not create admin.';
                    createAdminBtn.disabled = false;
                    createAdminBtn.textContent = 'Create Admin →';
                    // Someone else may have completed setup in the meantime —
                    // flip back to the normal login form if so.
                    if (data.error && data.error.indexOf('already') !== -1) checkUsersExist();
                }
            }).catch(function(err) {
                createAdminError.textContent = 'Network error — try again.';
                createAdminBtn.disabled = false;
                createAdminBtn.textContent = 'Create Admin →';
            });
        });

        function loginSuccess() {
            try {
                saveUser(currentUser);
                loginOverlay.classList.add('hidden');
                app.classList.add('show');
                userAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
                userNameTag.textContent = currentUser.name;
                var sAvatar = document.getElementById('sidebar-avatar');
                if (sAvatar) sAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
                var sName = document.getElementById('sidebar-name');
                if (sName) sName.textContent = currentUser.name;
                var sRole = document.getElementById('sidebar-role');
                if (sRole) sRole.textContent = (currentUser.role || 'technician').charAt(0).toUpperCase() + (currentUser.role || 'technician').slice(1);
                if (!appInitialized) {
                    initApp();
                    appInitialized = true;
                }
                switchView('customers');
                renderAll();
            } catch(err) {
                console.error('❌ loginSuccess error:', err.message, err.stack);
            }
        }

        // ─── LOGOUT ──────────────────────────────────────────────────────────
        function logout() {
            currentUser = null;
            clearStoredUser();
            // Do NOT sign out of Firebase Auth — the anonymous session must stay active
            // so Firebase Rules (auth != null) keep working when user logs back in.
            // Only clear the app-level user (badge/name/role).
            loginOverlay.classList.remove('hidden');
            app.classList.remove('show');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In →';
            loginName.value = '';
            loginBadge.value = '';
            loginError.textContent = '';
            checkUsersExist();
            showToast('Signed out');
        }

        logoutBtnVisible.addEventListener('click', logout);

        // ─── APPLY ROLE UI ──────────────────────────────────────────────────
        // No-op: with Tasks/Archive/Audit/Users removed there's nothing left
        // to gate by role in a solo-engineer build. Kept as a function (rather
        // than removing every call site) so loginSuccess()/ui.js don't need
        // touching every time this changes.
        function applyRoleUI() {}

        // ─── STARTUP ──────────────────────────────────────────────────────────
        // Sign in anonymously FIRST so Firebase Rules are satisfied for all reads
        function startApp() {
            var stored = loadStoredUser();
            if (stored) {
                var readTimeout = setTimeout(function() {
                    console.error('Login check timed out after 5s — showing login');
                    clearStoredUser();
                    checkUsersExist();
                }, 5000);
                fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'login', name: stored.name, badge: stored.badge })
                }).then(function(res) { return res.json(); })
                .then(function(data) {
                    clearTimeout(readTimeout);
                    if (data.ok) {
                        currentUser = { badge: data.user.badge, name: data.user.name, role: data.user.role || 'technician' };
                        loginSuccess();
                    } else {
                        // Badge/name no longer match (e.g. account removed or renamed) — sign out.
                        clearStoredUser();
                        checkUsersExist();
                    }
                }).catch(function(err) {
                    clearTimeout(readTimeout);
                    console.error('Stored user lookup failed:', err);
                    clearStoredUser();
                    checkUsersExist();
                });
            } else {
                checkUsersExist();
            }
        }

        // Wait for anon auth (started in firebase-init.js) then start app
        onAuthReady(function() {
            startApp();
        });
