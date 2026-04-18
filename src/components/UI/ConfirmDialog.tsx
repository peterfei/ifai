import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

type ConfirmTone = 'default' | 'danger';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  const icon =
    tone === 'danger' ? (
      <Trash2 size={18} className="theme-text-danger" />
    ) : (
      <AlertTriangle size={18} className="theme-text-warning" />
    );

  const iconSurfaceClass =
    tone === 'danger'
      ? 'theme-surface-danger theme-border'
      : 'theme-surface-warning theme-border';

  const confirmButtonClass =
    tone === 'danger' ? 'theme-button-danger' : 'theme-button-primary';

  return (
    <div
      className="theme-backdrop-strong fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="theme-panel-elevated theme-border theme-shadow w-full max-w-md rounded-xl border"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="theme-border flex items-start gap-3 border-b px-5 py-4">
          <div className={`${iconSurfaceClass} rounded-lg border p-2`}>{icon}</div>
          <div className="min-w-0 flex-1">
            <h3 className="theme-text text-base font-semibold">{title}</h3>
            <p className="theme-text-subtle mt-1 text-sm">{description}</p>
          </div>
          <button
            onClick={onCancel}
            className="theme-button-ghost rounded-lg p-1.5"
            aria-label={cancelLabel}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4">
          <button
            onClick={onCancel}
            className="theme-button-secondary rounded-lg px-4 py-2 text-sm font-medium"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`${confirmButtonClass} rounded-lg px-4 py-2 text-sm font-medium`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
