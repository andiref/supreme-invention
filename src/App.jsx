import { useState } from 'react';
import { useFirebaseReady } from './firebase/useFirebaseReady.js';
import { useDefects, useProdVol, useCapaData, useEquipment, useConnectionStatus } from './firebase/useRealtimeData.js';
import { useAppAuth } from './state/useAppAuth.js';
import { useTheme } from './state/useTheme.js';
import { useToast } from './state/useToast.js';
import { useConfirm } from './state/useConfirm.js';

import LoginScreen from './components/layout/LoginScreen.jsx';
import Shell from './components/layout/Shell.jsx';
import Toast from './components/common/Toast.jsx';
import ConfirmDialog from './components/common/ConfirmDialog.jsx';

import YieldView from './components/views/YieldView.jsx';
import TimeView from './components/views/TimeView.jsx';
import LibraryView from './components/views/LibraryView.jsx';
import ReportView from './components/report/ReportView.jsx';
import EquipmentView from './components/equipment/EquipmentView.jsx';

export default function App() {
  const firebaseReady = useFirebaseReady();
  const { user, login, logout, error: loginError, loading: loginLoading } = useAppAuth();
  const { isLight, toggleTheme } = useTheme();
  const { toastMessage, showToast } = useToast();
  const { confirmState, showConfirm, closeConfirm, confirmYes } = useConfirm();
  const [currentView, setCurrentView] = useState('yield');

  const connected = useConnectionStatus(firebaseReady && !!user);
  const { value: defectRows } = useDefects(firebaseReady && !!user);
  const { value: prodVolRows } = useProdVol(firebaseReady && !!user);
  const { value: capaRecords } = useCapaData(firebaseReady && !!user);
  const { value: equipment } = useEquipment(firebaseReady && !!user);

  if (!user) {
    // Toast isn't rendered here — nothing triggers one before login succeeds,
    // and #toast's styling is scoped under #app (see the logged-in branch below).
    return <LoginScreen onLogin={login} error={loginError} loading={loginLoading} />;
  }

  return (
    <div id="app" className="show">
      <Shell
        user={user}
        currentView={currentView}
        onNavigate={setCurrentView}
        connected={connected}
        isLight={isLight}
        onToggleTheme={toggleTheme}
        onLogout={logout}
      >
        {currentView === 'yield' && (
          <YieldView defectRows={defectRows} prodVolRows={prodVolRows} userEmail={user.email} showToast={showToast} showConfirm={showConfirm} />
        )}
        {currentView === 'time' && <TimeView defectRows={defectRows} />}
        {currentView === 'library' && <LibraryView />}
        {currentView === 'report' && (
          <ReportView
            defectRows={defectRows}
            prodVolRows={prodVolRows}
            capaRecords={capaRecords}
            userEmail={user.email}
            showToast={showToast}
            showConfirm={showConfirm}
          />
        )}
        {currentView === 'equipment' && (
          <EquipmentView equipment={equipment} userEmail={user.email} showToast={showToast} showConfirm={showConfirm} />
        )}
      </Shell>
      <Toast message={toastMessage} />
      <ConfirmDialog state={confirmState} onYes={confirmYes} onNo={closeConfirm} />
    </div>
  );
}
