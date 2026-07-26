// ============================================
// users.js — All user-account operations
//
// This is the ONLY place user accounts are read or written. The client
// never talks to the Firebase `users` node directly (see database.rules.json,
// which denies client read/write on that path entirely). That closes two
// holes the old direct-Firebase version had:
//   1. The full roster (names, badges, roles) was downloadable by anyone
//      who loaded the page, before logging in.
//   2. "Add user" / "delete user" were plain client-side writes, gated only
//      by a UI check — anyone could grant themselves admin from devtools.
//
// Actions (all POST, JSON body with an `action` field):
//   exists          - public, no badge required. { exists: bool } only.
//   login           - public. { name, badge } -> { user } or generic error.
//   bootstrap-admin - public, but server re-checks no users exist yet.
//   list            - admin only. Returns [{ badge, name, role }].
//   add             - admin only. { name, badge, role }.
//   delete          - admin only. { badge }.
// ============================================

import {
    CORS_HEADERS, jsonResponse, errorResponse,
    sanitize, sanitizeKey, getToken, fbGet, fbSet, fbDelete, fbPush,
    VALID_ROLES, requireAdmin
} from './_shared.js';

// Generic message for any login/lookup failure — never reveal whether the
// badge exists, only exists but name didn't match, etc.
const LOGIN_FAIL_MSG = 'Invalid name or badge.';

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405);
    }

    try {
        if (!env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL) {
            return errorResponse('Missing Firebase credentials', 500);
        }

        const body = await request.json();
        const action = body.action;
        const now = Date.now();
        const token = await getToken(env);

        // ── EXISTS (public) ─────────────────────────────────────────────
        // Used by the login screen to decide whether to show the
        // "create first admin" flow. Reveals only a boolean, never the
        // roster itself.
        if (action === 'exists') {
            const all = await fbGet(env, token, 'users');
            return jsonResponse({ ok: true, exists: !!(all && Object.keys(all).length) });
        }

        // ── LOGIN (public) ──────────────────────────────────────────────
        // Also used for session-restore on page reload.
        if (action === 'login') {
            const name = sanitize(body.name || '', 100);
            const badge = sanitizeKey(body.badge || '');
            if (!name || !badge) return errorResponse(LOGIN_FAIL_MSG, 401);

            const user = await fbGet(env, token, `users/${badge}`);
            if (!user || !user.name || user.name.toLowerCase() !== name.toLowerCase()) {
                // Same generic error whether the badge doesn't exist or the
                // name doesn't match — don't leak which one it was.
                return errorResponse(LOGIN_FAIL_MSG, 401);
            }
            return jsonResponse({
                ok: true,
                user: { badge, name: user.name, role: user.role || 'technician' }
            });
        }

        // ── BOOTSTRAP FIRST ADMIN (public, but self-checking) ───────────
        if (action === 'bootstrap-admin') {
            const name = sanitize(body.name || '', 100);
            const badge = sanitizeKey(body.badge || '');
            if (!name || !badge) return errorResponse('Both fields required.');

            // Re-check on the server — don't trust the client's decision
            // to show the "create admin" form. If ANY user already
            // exists, refuse, regardless of what the UI displayed.
            const all = await fbGet(env, token, 'users');
            if (all && Object.keys(all).length > 0) {
                return errorResponse('Setup already completed — please sign in instead.', 403);
            }

            const userData = { name, role: 'admin' };
            await fbSet(env, token, `users/${badge}`, userData);
            await fbPush(env, token, 'smt_audit', {
                action: 'create',
                detail: `First admin account created: ${name}`,
                badge, timestamp: now, source: 'server'
            });
            return jsonResponse({ ok: true, user: { badge, name, role: 'admin' } });
        }

        // ── Everything below requires an authenticated admin ────────────
        const headerBadge = request.headers.get('X-Badge');
        const admin = await requireAdmin(env, token, headerBadge);
        if (admin.error) return admin.error;
        const { badge: adminBadge } = admin;

        // ── LIST (admin only) ────────────────────────────────────────────
        if (action === 'list') {
            const all = await fbGet(env, token, 'users') || {};
            const users = Object.keys(all).map(function(b) {
                return { badge: b, name: all[b].name, role: all[b].role || 'technician' };
            });
            return jsonResponse({ ok: true, users });
        }

        // ── ADD (admin only) ─────────────────────────────────────────────
        if (action === 'add') {
            const name = sanitize(body.name || '', 100);
            const newBadge = sanitizeKey(body.badge || '');
            const role = VALID_ROLES.includes(body.role) ? body.role : 'technician';
            if (!name || !newBadge) return errorResponse('Name and badge required.');

            const existing = await fbGet(env, token, `users/${newBadge}`);
            if (existing) return errorResponse('Badge already exists.');

            await fbSet(env, token, `users/${newBadge}`, { name, role });
            await fbPush(env, token, 'smt_audit', {
                action: 'create',
                detail: `User added: ${name} (${role})`,
                badge: adminBadge, timestamp: now, source: 'server'
            });
            return jsonResponse({ ok: true, msg: 'User added ✓' });
        }

        // ── DELETE (admin only) ──────────────────────────────────────────
        if (action === 'delete') {
            const targetBadge = sanitizeKey(body.badge || '');
            if (!targetBadge) return errorResponse('Missing badge.');
            if (targetBadge === adminBadge) {
                return errorResponse('You cannot delete your own account.');
            }

            const target = await fbGet(env, token, `users/${targetBadge}`);
            if (!target) return errorResponse('User not found', 404);

            // Don't allow the last admin to be deleted — avoids locking
            // everyone out of user management.
            if ((target.role || 'technician') === 'admin') {
                const all = await fbGet(env, token, 'users') || {};
                const adminCount = Object.keys(all).filter(function(b) {
                    return (all[b].role || 'technician') === 'admin';
                }).length;
                if (adminCount <= 1) {
                    return errorResponse('Cannot delete the last remaining admin.');
                }
            }

            await fbDelete(env, token, `users/${targetBadge}`);
            await fbPush(env, token, 'smt_audit', {
                action: 'delete',
                detail: `User deleted: ${target.name}`,
                badge: adminBadge, timestamp: now, source: 'server'
            });
            return jsonResponse({ ok: true, msg: 'User deleted ✓' });
        }

        return errorResponse('Unknown action');

    } catch (err) {
        console.error('users.js error:', err.message);
        return errorResponse('Server error: ' + err.message, 500);
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}
