// ConfirmDialog - Reusable confirmation dialog
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from '@radix-ui/themes';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  discardLabel?: string;
  onDiscard?: () => void | Promise<void>;
  discardVariant?: 'danger' | 'default';
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  discardLabel = 'Discard',
  onDiscard,
  discardVariant = 'danger',
  variant = 'default'
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleDiscard = async () => {
    if (!onDiscard) return;
    await onDiscard();
    onOpenChange(false);
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
        <AlertDialog.Overlay className="fixed" style={{ inset: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 50 }} />
        <AlertDialog.Content className="fixed p-4 rounded-lg" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--color-background)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', width: '400px', zIndex: 50 }}>
          <AlertDialog.Title className="text-sm font-semibold mb-3" style={{ color: 'var(--gray-12)' }}>
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-xs mb-4" style={{ color: 'var(--gray-11)' }}>
            {description}
          </AlertDialog.Description>
          <div className="flex items-center justify-between gap-2">
            {onDiscard ? (
              <AlertDialog.Action asChild>
                <Button
                  onClick={handleDiscard}
                  color={discardVariant === 'danger' ? 'red' : undefined}
                  size="1"
                >
                  {discardLabel}
                </Button>
              </AlertDialog.Action>
            ) : (
              <span />
            )}
            {/* Right side: Cancel + Confirm */}
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="soft" size="1">
                  {cancelLabel}
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  onClick={handleConfirm}
                  color={variant === 'danger' ? 'red' : undefined}
                  size="1"
                >
                  {confirmLabel}
                </Button>
              </AlertDialog.Action>
            </div>
          </div>
        </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
