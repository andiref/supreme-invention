/* ═══════════════════════════════════════════════════════════
   UI CONTROLLER
   ═══════════════════════════════════════════════════════════ */

var currentUser = null;
var readTimeout = null;

function initApp() {
    initListeners();
    initNav();
    initCustomerForms();
    initThemeToggles();
    initUpload('defect');
    initUpload('prod');
    updateHeader();
    setInterval(updateHeader, 60000);

    var stored = getStoredUser();
    if (stored && stored.expires > Date.now()) {
        currentUser = stored;
        startApp();
    } else {
        clearStoredUser();
        showLogin();
    }
}

function initListeners() {
    window.addEventListener('online', function() { showToast('Back online'); });
    window.addEventListener('offline', function() { showToast('Offline mode'); });
}

function initNav() {
    document.querySelectorAll('.nav-item').forEach(function(el) {
        el.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(function(x) { x.classList.remove('active'); });
            el.classList.add('active');
        });
    });
}

function switchView(view) {
    document.querySelectorAll('.view').forEach(function(v) { v.classList.add('hidden'); });
    var target = document.getElementById('view-' + view);
    if (target) target.classList.remove('hidden');
    document.getElementById('page-title').textContent = view.charAt(0).toUpperCase() + view.slice(1);

    if (view === 'customers') renderCustomers();
    if (view === 'complaints') renderComplaints();
    if (view === 'yield') renderYield();
    if (view === 'dashboard') renderDashboard();
}

function showLogin() {
    var modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.innerHTML =
        '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;">' +
        '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;min-width:300px;">' +
        '<h3 style="margin:0 0 16px;">Login</h3>' +
        '<input id="login-email" type="email" placeholder="Email" style="width:100%;padding:8px;margin-bottom:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);" />' +
        '<button onclick="doLogin()" style="width:100%;padding:8px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;">Login</button>' +
        '</div></div>';
    document.body.appendChild(modal);
}

function doLogin() {
    var email = document.getElementById('login-email').value.trim();
    if (!email) { showToast('Enter email'); return; }

    fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
    }).then(function(r) { return r.json(); })
      .then(function(d) {
          if (d.ok) {
              currentUser = { email: d.email, name: d.name, expires: Date.now() + 8 * 3600000 };
              setStoredUser(currentUser);
              var modal = document.getElementById('login-modal');
              if (modal) modal.remove();
              startApp();
          } else {
              showToast(d.error || 'Login failed');
          }
      }).catch(function() { showToast('Network error'); });
}

function logout() {
    clearStoredUser();
    currentUser = null;
    location.reload();
}

function startApp() {
    if (!currentUser) return;
    document.getElementById('user-email').textContent = currentUser.email;

    readTimeout = setTimeout(function() {
        showToast('Firebase read timeout — check connection');
    }, 10000);

    fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Email': currentUser.email },
        body: JSON.stringify({ email: currentUser.email })
    }).then(function(r) {
        clearTimeout(readTimeout);
        return r.json();
    }).then(function(d) {
        if (!d.ok) { logout(); return; }
        loadFirebaseData();
    }).catch(function(err) {
        clearTimeout(readTimeout);
        console.error('Auth check failed:', err);
        clearStoredUser();
    });
}

function loadFirebaseData() {
    var db = firebase.database();

    safeOnValue(db.ref('smt_customers'), function(snap) {
        var val = snap.val() || {};
        customers = Object.keys(val).map(function(k) { return { id: k, ...val[k] }; });
        if (document.getElementById('view-customers') && !document.getElementById('view-customers').classList.contains('hidden')) {
            renderCustomers();
        }
        updateHeader();
    });

    safeOnValue(db.ref('smt_models'), function(snap) {
        var val = snap.val() || {};
        models = Object.keys(val).map(function(k) { return val[k].name; });
    });

    safeOnValue(db.ref('smt_complaints'), function(snap) {
        var val = snap.val() || {};
        complaints = Object.keys(val).map(function(k) { return { id: k, ...val[k] }; });
        if (document.getElementById('view-complaints') && !document.getElementById('view-complaints').classList.contains('hidden')) {
            renderComplaints();
        }
        if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
            renderDashboard();
        }
    });

    safeOnValue(db.ref('smt_defects'), function(snap) {
        var val = snap.val() || {};
        rawDef = Object.keys(val).map(function(k) { return val[k]; });
        if (document.getElementById('view-yield') && !document.getElementById('view-yield').classList.contains('hidden')) {
            renderYield();
        }
    });

    safeOnValue(db.ref('smt_prodvol'), function(snap) {
        var val = snap.val() || {};
        prodVol = Object.keys(val).map(function(k) { return { id: k, ...val[k] }; });
    });

    safeOnValue(db.ref('smt_modeltiers'), function(snap) {
        var val = snap.val() || {};
        modelTiers = Object.keys(val).map(function(k) { return { id: k, ...val[k] }; });
    });
}

// FIXED: detach listener before retry to prevent memory leak
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
    extra.innerHTML = '<span style="color:var(--muted);font-size:12px;">' +
        now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) +
        '</span>';
}

function showToast(msg) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--surface2);color:var(--text);padding:10px 16px;border-radius:8px;border:1px solid var(--border);z-index:9999;font-size:12px;animation:fadeIn 0.3s;';
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3000);
}

function getStoredUser() {
    try { return JSON.parse(localStorage.getItem('smt_user')); } catch(e) { return null; }
}

function setStoredUser(u) {
    localStorage.setItem('smt_user', JSON.stringify(u));
}

function clearStoredUser() {
    localStorage.removeItem('smt_user');
}

function initThemeToggles() {
    var toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    var dark = localStorage.getItem('smt_theme') === 'dark';
    toggle.checked = dark;
    if (dark) document.body.classList.add('dark');
    toggle.addEventListener('change', function() {
        document.body.classList.toggle('dark', toggle.checked);
        localStorage.setItem('smt_theme', toggle.checked ? 'dark' : 'light');
        invalidateCssVarCache();
    });
}

function toggleTheme() {
    var toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.dispatchEvent(new Event('change'));
}
