import { memo } from 'react';

export default memo(function ConfirmModal({
  isOpen,
  title = 'Confirmer',
  message = '',
  confirmLabel = 'Confirmer',
  danger = false,
  onConfirm,
  onCancel,
  loading = false,
}) {
  if (!isOpen) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card card confirm-card">
        <div className="modal-head confirm-head">
          <span className="brand-mark sm danger-mark" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <div><h3>{title}</h3><p className="muted">{message}</p></div>
        </div>
        <div className="confirm-actions">
          <button className="ghost-btn" type="button" onClick={onCancel} disabled={loading}>Annuler</button>
          <button className={danger ? 'primary-btn danger-btn confirm-submit' : 'primary-btn confirm-submit'} type="button" onClick={onConfirm} disabled={loading}>
            {loading ? 'Application...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
});
