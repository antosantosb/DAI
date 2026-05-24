import { useEffect } from 'react';
import './Modal.css';

export default function Modal({ open, onClose, onConfirm, title, message, type = 'info', confirmText, cancelText, children }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const icons = {
    info: { symbol: '\u2139', cls: 'modal-icon--info' },
    warning: { symbol: '\u26A0', cls: 'modal-icon--warning' },
    danger: { symbol: '\u2716', cls: 'modal-icon--danger' },
    success: { symbol: '\u2714', cls: 'modal-icon--success' },
  };

  const icon = icons[type] || icons.info;

  // Quando há `children` (conteúdo livre), suprime ícone e ações padrão — fica um container limpo.
  const hasChildren = children != null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        {!hasChildren && <div className={`modal-icon ${icon.cls}`}>{icon.symbol}</div>}
        {title && <h3 className="modal-title">{title}</h3>}
        {message && <p className="modal-message">{message}</p>}
        {children}
        {!hasChildren && (
          <div className="modal-actions">
            {onConfirm && (
              <button
                className={`btn ${type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-warning' : 'btn-primary'}`}
                onClick={onConfirm}
              >
                {confirmText || 'Confirmar'}
              </button>
            )}
            <button className="btn btn-secondary" onClick={onClose}>
              {cancelText || (onConfirm ? 'Cancelar' : 'Fechar')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
