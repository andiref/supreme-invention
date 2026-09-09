import { lazy, Suspense, useEffect, useState } from 'react';
import { useFirebaseReady } from './firebase/useFirebaseReady.js';
import { useDefects, useProdVol, useCapaData, useEquipment } from './firebase/useFirebaseData.js';
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
  const [refreshKeys, setRefreshKeys] = useState({ all: 0, defects: 0, prodVol: 0, capa: 0, equipment: 0 });
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  // Set by "View in Library" from Quality Assistant findings — which defect
  // type Library should land on and pre-select when it opens. Cleared once
  // LibraryView has consumed it, so navigating to Library normally afterward
  // (via the nav bar) doesn't keep jumping back to a stale target.
  const [libraryFocusType, setLibraryFocusType] = useState(null);
  const openLibrary = (defectType) => { setLibraryFocusType(defectType); setCurrentView('library'); };

  const ready = firebaseReady && !!user;
  const effectiveKeys = {
    defects: refreshKeys.all + refreshKeys.defects,
    prodVol: refreshKeys.all + refreshKeys.prodVol,
    capa: refreshKeys.all + refreshKeys.capa,
    equipment: refreshKeys.all + refreshKeys.equipment,
  };
  const { value: defectRows, error: defectsError, loading: defectsLoading } = useDefects(ready, effectiveKeys.defects);
  const { value: prodVolRows, error: prodVolError, loading: prodVolLoading } = useProdVol(ready, effectiveKeys.prodVol);
  const { value: capaRecords, error: capaError, loading: capaLoading } = useCapaData(ready, effectiveKeys.capa);
  const { value: equipment, error: equipmentError, loading: equipmentLoading } = useEquipment(ready, effectiveKeys.equipment);
  const dataLoading = defectsLoading || prodVolLoading || capaLoading || equipmentLoading;

  const handleRefresh = (scope = 'all') => {
    setLastSyncedAt(null);
    setRefreshKeys((prev) => {
      if (scope === 'all') return { ...prev, all: prev.all + 1 };
      if (scope === 'defects') return { ...prev, defects: prev.defects + 1 };
      if (scope === 'prodvol') return { ...prev, prodVol: prev.prodVol + 1 };
      if (scope === 'capa') return { ...prev, capa: prev.capa + 1 };
      if (scope === 'equipment') return { ...prev, equipment: prev.equipment + 1 };
      return { ...prev, all: prev.all + 1 };
    });
  };

  const dataError = defectsError || prodVolError || capaError || equipmentError;

  useEffect(() => {
    if (ready && !dataLoading) setLastSyncedAt(new Date());
  }, [ready, dataLoading]);

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
        syncing={dataLoading}
        lastSyncedAt={lastSyncedAt}
        onRefresh={handleRefresh}
        isLight={isLight}
        onToggleTheme={toggleTheme}
        onLogout={logout}
      >
        <Suspense fallback={<div id="yc-root"><div className="card"><div className="ct">LOADING VIEW…</div></div></div>}>
        {dataLoading ? (
          <div id="yc-root">
            <div className="card">
              <div className="ct">⏳ SYNCING DATA…</div>
              <div style={{ fontSize: 11, color: 'var(--yc-muted)' }}>Loading your defect, production, CAPA, and equipment snapshot from the cloud.</div>
            </div>
          </div>
        ) : (
        <>
        {currentView === 'yield' && (
          <YieldView defectRows={defectRows} prodVolRows={prodVolRows} showToast={showToast} showConfirm={showConfirm} onDataChanged={handleRefresh} />
        )}
        {currentView === 'time' && <TimeView defectRows={defectRows} />}
        {currentView === 'library' && (
          <LibraryView focusType={libraryFocusType} onFocusHandled={() => setLibraryFocusType(null)} />
        )}
        {currentView === 'report' && (
          <ReportView
            defectRows={defectRows}
            prodVolRows={prodVolRows}
            capaRecords={capaRecords}
            showToast={showToast}
            showConfirm={showConfirm}
            onDataChanged={handleRefresh}
          />
        )}
        {currentView === 'equipment' && (
          <EquipmentView equipment={equipment} showToast={showToast} showConfirm={showConfirm} onDataChanged={handleRefresh} />
        )}
        {currentView === 'health' && (
          <DataHealthView defectRows={defectRows} prodVolRows={prodVolRows} capaRecords={capaRecords} />
        )}
        {currentView === 'assistant' && (
          <QualityAssistantView defectRows={defectRows} prodVolRows={prodVolRows} capaRecords={capaRecords} onOpenLibrary={openLibrary} />
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
