// ─── FIREBASE INIT (Compat v10) ───────────────────────────────────
firebase.initializeApp({
    apiKey: "AIzaSyDb5NmUfwEDTHwTmvnR7NF-rk8ATHoClW0",
    authDomain: "smt-engineer-report.firebaseapp.com",
    databaseURL: "https://smt-engineer-report-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "smt-engineer-report",
    storageBucket: "smt-engineer-report.firebasestorage.app",
    messagingSenderId: "205951205",
    appId: "1:205951205:web:7be41b28c95c9db5e6040c",
    measurementId: "G-DHS0K5HZYT"
});

var db = firebase.database();
var auth = firebase.auth();
var analytics = firebase.analytics();

// Auth ready system (unchanged)
var _authReady = false;
var _authCallbacks = [];

function onAuthReady(cb) {
    if (_authReady) { cb(); return; }
    _authCallbacks.push(cb);
}

function _fireAuthReady() {
    if (_authReady) return;
    _authReady = true;
    _authCallbacks.forEach(function(cb) { cb(); });
    _authCallbacks = [];
}

auth.onAuthStateChanged(function(user) {
    console.log('🔐 onAuthStateChanged fired, user:', user ? user.uid : 'null');
    if (user) {
        console.log('✅ Auth session exists — firing authReady');
        user.getIdToken(true).then(function() {
            _fireAuthReady();
        }).catch(function() {
            _fireAuthReady();
        });
    } else {
        console.log('⏳ No auth session — signing in anonymously');
        auth.signInAnonymously()
            .then(function() { console.log('✅ signInAnonymously success'); })
            .catch(function(err) {
                console.warn('❌ Anon auth failed:', err.message);
                _fireAuthReady();
            });
    }
});
