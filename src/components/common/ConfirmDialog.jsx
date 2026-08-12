export default function ConfirmDialog({ state, onYes, onNo }) {
  return (
    <div id="confirm-overlay" className={state ? 'show' : ''}>
      {state && (
        <div id="confirm-box">
          <div id="confirm-title">{state.title}</div>
          <div id="confirm-msg">{state.message}</div>
          <div className="confirm-btns">
            <button className="confirm-no" onClick={onNo}>Cancel</button>
            <button className="confirm-yes" onClick={onYes}>{state.yesLabel || 'Confirm'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
