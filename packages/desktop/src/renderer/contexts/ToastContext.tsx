import { createContext, useCallback, useContext, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  dismissing: boolean;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
  error: (message: string) => void;
  success: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 4000;
const DISMISS_ANIMATION_MS = 200;
const MAX_VISIBLE_TOASTS = 5;

function getVariantStyles(variant: ToastVariant): { background: string; border: string; color: string; icon: string } {
  switch (variant) {
    case 'error':
      return { background: 'var(--red-3)', border: '1px solid var(--red-7)', color: 'var(--red-11)', icon: 'var(--red-9)' };
    case 'success':
      return { background: 'var(--green-3)', border: '1px solid var(--green-7)', color: 'var(--green-11)', icon: 'var(--green-9)' };
    case 'warning':
      return { background: 'var(--amber-3)', border: '1px solid var(--amber-7)', color: 'var(--amber-11)', icon: 'var(--amber-9)' };
    case 'info':
    default:
      return { background: 'var(--blue-3)', border: '1px solid var(--blue-7)', color: 'var(--blue-11)', icon: 'var(--blue-9)' };
  }
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): ReactElement {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counterRef = useRef(0);

  const dismissToast = useCallback((id: string): void => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DISMISS_ANIMATION_MS);
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info', duration: number = DEFAULT_DURATION_MS): void => {
    counterRef.current += 1;
    const id = `toast-${counterRef.current}-${Date.now()}`;
    const newToast: ToastMessage = { id, message, variant, duration, dismissing: false };

    setToasts((prev) => {
      const next = [...prev, newToast];
      return next.length > MAX_VISIBLE_TOASTS ? next.slice(-MAX_VISIBLE_TOASTS) : next;
    });

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }
  }, [dismissToast]);

  const error = useCallback((message: string): void => {
    toast(message, 'error', 6000);
  }, [toast]);

  const success = useCallback((message: string): void => {
    toast(message, 'success');
  }, [toast]);

  const warning = useCallback((message: string): void => {
    toast(message, 'warning', 5000);
  }, [toast]);

  const info = useCallback((message: string): void => {
    toast(message, 'info');
  }, [toast]);

  const contextValue: ToastContextValue = { toast, error, success, warning, info };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps): ReactElement {
  if (toasts.length === 0) {
    return <></>;
  }

  return (
    <>
      <style>{`
        @keyframes toast-slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes toast-slide-out {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
        .quest-toast-enter {
          animation: toast-slide-in 200ms ease-out forwards;
        }
        .quest-toast-exit {
          animation: toast-slide-out 200ms ease-in forwards;
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
          maxWidth: '400px',
        }}
      >
        {toasts.map((t) => {
          const styles = getVariantStyles(t.variant);
          return (
            <div
              key={t.id}
              className={t.dismissing ? 'quest-toast-exit' : 'quest-toast-enter'}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '6px',
                background: styles.background,
                border: styles.border,
                color: styles.color,
                fontSize: '12px',
                lineHeight: '1.4',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                maxWidth: '400px',
                wordBreak: 'break-word',
              }}
            >
              <span style={{ flex: 1 }}>{t.message}</span>
              <button
                onClick={() => onDismiss(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0',
                  color: styles.icon,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <XMarkIcon style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
