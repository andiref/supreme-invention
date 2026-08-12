// ============================================
// firebase/config.js — same Firebase project as the original app.
// This is a client-side config object (not a secret) — access is
// enforced by Firebase Realtime Database security rules + the /api/*
// owner-email check, not by hiding this key.
// ============================================
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDb5NmUfwEDTHwTmvnR7NF-rk8ATHoClW0',
  authDomain: 'smt-engineer-report.firebaseapp.com',
  databaseURL: 'https://smt-engineer-report-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'smt-engineer-report',
  storageBucket: 'smt-engineer-report.firebasestorage.app',
  messagingSenderId: '205951205',
  appId: '1:205951205:web:7be41b28c95c9db5e6040c',
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
