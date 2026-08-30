import { lazy, Suspense, useState } from 'react';
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

const YieldView = lazy(() => import('./components/views/YieldView.jsx'));
const TimeView = lazy(() => import('./components/views/TimeView.jsx'));
const LibraryView = lazy(() => import('./components/views/LibraryView.jsx'));
const ReportView = lazy(() => import('./components/report/ReportView.jsx'));
const EquipmentView = lazy(() => import('./components/equipment/EquipmentView.jsx'));
const DataHealthView = lazy(() => import('./components/views/DataHealthView.jsx'));
const QualityAssistantView = lazy(() => import('./components/views/QualityAssistantView.jsx'));

export default function App() {
  const firebaseReady = useFirebaseReady();
  const { user, login, logout, resetPassword, error: loginError, loading: loginLoading } = useAppAuth();
  const { isLight, toggleTheme } = useTheme();
  const { toastMessage, showToast } = useToast();
  const { confirmState, showConfirm, closeConfirm, confirmYes } = useConfirm();
  const [currentView, setCurrentView] = useState('yield');

  const connected = useConnectionStatus(firebaseReady && !!user);
  const { value: defectRows, loading: defectsLoading } = useDefects(firebaseReady && !!user);
  const { value: prodVolRows, loading: prodVolLoading } = useProdVol(firebaseReady && !!user);
  const { value: capaRecords, loading: capaLoading } = useCapaData(firebaseReady && !!user);
  const { value: equipment, loading: equipmentLoading } = useEquipment(firebaseReady && !!user);
  const dataLoading = defectsLoading || prodVolLoading || capaLoading || equipmentLoading;

  if (!user) {
    // Toast isn't rendered here — nothing triggers one before login succeeds,
    // and #toast's styling is scoped under #app (see the logged-in branch below).
    return <LoginScreen onLogin={login} onResetPassword={resetPassword} error={loginError} loading={loginLoading} />;
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
        <Suspense fallback={<div id="yc-root"><div className="card"><div className="ct">LOADING VIEW…</div></div></div>}>
        {dataLoading ? (
          <div id="yc-root">
            <div className="card">
              <div className="ct">⏳ SYNCING DATA…</div>
              <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>Connecting to your defect, production, CAPA, and equipment records for the first time this session.</div>
            </div>
          </div>
        ) : (
        <>
        {currentView === 'yield' && (
          <YieldView defectRows={defectRows} prodVolRows={prodVolRows} showToast={showToast} showConfirm={showConfirm} />
        )}
        {currentView === 'time' && <TimeView defectRows={defectRows} />}
        {currentView === 'library' && <LibraryView />}
        {currentView === 'report' && (
          <ReportView
            defectRows={defectRows}
            prodVolRows={prodVolRows}
            capaRecords={capaRecords}
            showToast={showToast}
            showConfirm={showConfirm}
          />
        )}
        {currentView === 'equipment' && (
          <EquipmentView equipment={equipment} showToast={showToast} showConfirm={showConfirm} />
        )}
        {currentView === 'health' && (
          <DataHealthView defectRows={defectRows} prodVolRows={prodVolRows} capaRecords={capaRecords} />
        )}
        {currentView === 'assistant' && (
          <QualityAssistantView defectRows={defectRows} prodVolRows={prodVolRows} capaRecords={capaRecords} />
        )}
        </>
        )}
        </Suspense>
      </Shell>
      <Toast message={toastMessage} />
      <ConfirmDialog state={confirmState} onYes={confirmYes} onNo={closeConfirm} />
    </div>
  );
}
