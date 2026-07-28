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
                    if (user && user.email) {
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

        // (No role helpers — this app has exactly one user, so there's
        // nothing left to gate by role.)

        // ─── DOM REFS ──────────────────────────────────────────────────────
        var loginOverlay = document.getElementById('login-overlay');
        var loginForm = document.getElementById('login-form');
        var loginEmail = document.getElementById('login-email');
        var loginBtn = document.getElementById('login-btn');
        var loginError = document.getElementById('login-error');

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

        // (No "does a user exist yet" check needed — there's exactly one
        // owner, verified server-side against OWNER_EMAIL on every login.)

        // ─── LOGIN ─────────────────────────────────────────────────────────
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var email = loginEmail.value.trim();
            if (!email) { loginError.textContent = 'Please enter your email.'; return; }
            loginError.textContent = '';
            loginBtn.disabled = true;
            loginBtn.textContent = '…';

            fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'login', email: email })
            }).then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.ok) {
                    currentUser = { email: data.user.email };
                    loginSuccess();
                } else {
                    loginError.textContent = data.error || 'Invalid email.';
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Sign In →';
                }
            }).catch(function(err) {
                loginError.textContent = 'Network error — try again.';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In →';
            });
        });

        function loginSuccess() {
            try {
                saveUser(currentUser);
                loginOverlay.classList.add('hidden');
                app.classList.add('show');
                userAvatar.textContent = currentUser.email.charAt(0).toUpperCase();
                userNameTag.textContent = currentUser.email;
                var sAvatar = document.getElementById('sidebar-avatar');
                if (sAvatar) sAvatar.textContent = currentUser.email.charAt(0).toUpperCase();
                var sName = document.getElementById('sidebar-name');
                if (sName) sName.textContent = currentUser.email;
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
            // so Firebase Rules (auth != null) keep working when you log back in.
            // Only clear the app-level user (email).
            loginOverlay.classList.remove('hidden');
            app.classList.remove('show');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In →';
            loginEmail.value = '';
            loginError.textContent = '';
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
                }, 5000);
                fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'login', email: stored.email })
                }).then(function(res) { return res.json(); })
                .then(function(data) {
                    clearTimeout(readTimeout);
                    if (data.ok) {
                        currentUser = { email: data.user.email };
                        loginSuccess();
                    } else {
                        // OWNER_EMAIL no longer matches (e.g. it was changed) — sign out.
                        clearStoredUser();
                    }
                }).catch(function(err) {
                    clearTimeout(readTimeout);
                    console.error('Stored user lookup failed:', err);
                    clearStoredUser();
                });
            }
        }

        // Wait for anon auth (started in firebase-init.js) then start app
        onAuthReady(function() {
            startApp();
        });
