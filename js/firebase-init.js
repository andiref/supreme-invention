        // ─── FIREBASE INIT ────────────────────────────────────────────────
        firebase.initializeApp({
            apiKey: "AIzaSyCULkpiLSXT79nrWWFl5IVJANhUEA8WJWU",
            authDomain: "smt-dashboard-cd090.firebaseapp.com",
            databaseURL: "https://smt-dashboard-cd090-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "smt-dashboard-cd090",
            storageBucket: "smt-dashboard-cd090.firebasestorage.app",
            messagingSenderId: "468538505165",
            appId: "1:468538505165:web:a491ecbcf5fd75b1a1f684"
        });
        var db = firebase.database();
        var auth = firebase.auth();

        // Enable offline persistence for stability
        try {
            firebase.database().enablePersistence({ synchronizeTabs: true })
                .catch(function(err) {
                    console.log('Persistence failed:', err.code);
                });
        } catch(e) {
            console.log('Persistence not supported');
        }

        // Ensure anonymous auth is active before any Firebase reads
        var _authReady = false;
        var _authCallbacks = [];

        function onAuthReady(cb) {
            if (_authReady) { cb(); return; }
            _authCallbacks.push(cb);
        }

        function _fireAuthReady() {
            if (_authReady) return; // only fire once
            _authReady = true;
            _authCallbacks.forEach(function(cb) { cb(); });
            _authCallbacks = [];
        }

        // onAuthStateChanged fires immediately on page load:
        // - user exists → session restored (page refresh) → ready
        // - user null → sign in anonymously first → then ready
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

