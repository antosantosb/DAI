import { useEffect, useRef } from 'react';
import './Modal.css';

export default function Modal({ open, onClose, onConfirm, title, message, type = 'info', confirmText, cancelText, children }) {
  const dialogRef = useRef(null);
  const lastFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    // Sprint -1 (FE-9-extra): a11y modal handling.
    // 1. Memorizar quem tinha focus antes de abrir, para restaurar ao fechar.
    lastFocusedRef.current = document.activeElement;

    // 2. Mover focus para dentro do modal (primeiro elemento focusable, ou o dialog).
    const dlg = dialogRef.current;
    if (dlg) {
      const focusables = dlg.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusables[0] || dlg).focus();
    }

    // 3. ESC fecha; Tab faz wrap dentro do modal (focus trap).
    const handler = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && dlg) {
        const focusables = Array.from(dlg.querySelectorAll(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus(); e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus(); e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      // 4. Ao fechar, devolver focus a quem o tinha antes.
      lastFocusedRef.current?.focus?.();
    };
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
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={message ? 'modal-message' : undefined}
        ref={dialogRef}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        {!hasChildren && <div className={`modal-icon ${icon.cls}`} aria-hidden="true">{icon.symbol}</div>}
        {title && <h3 id="modal-title" className="modal-title">{title}</h3>}
        {message && <p id="modal-message" className="modal-message">{message}</p>}
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
