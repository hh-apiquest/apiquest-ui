// Reusable input dialog component
import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button, TextField } from '@radix-ui/themes';

interface InputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
}

export function InputDialog({ 
  open, 
  onOpenChange, 
  title, 
  placeholder = "Enter name",
  defaultValue,
  onSubmit 
}: InputDialogProps) {
  const [value, setValue] = useState(defaultValue || '');

  // Update value when defaultValue or open changes
  useEffect(() => {
    if (open) {
      setValue(defaultValue || '');
    }
  }, [open, defaultValue]);

  const handleSubmit = () => {
    console.log('[InputDialog] handleSubmit called with value:', value);
    if (value.trim()) {
      console.log('[InputDialog] Calling onSubmit with:', value.trim());
      onSubmit(value.trim());
      setValue('');
      onOpenChange(false);
    } else {
      console.log('[InputDialog] Value is empty, not submitting');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Overlay className="fixed" style={{ inset: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 50 }} />
        <Dialog.Content className="fixed p-4 rounded-lg" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--color-background)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', width: '400px', zIndex: 50 }}>
          <Dialog.Title className="text-sm font-semibold mb-3" style={{ color: 'var(--gray-12)' }}>{title}</Dialog.Title>
          
          <TextField.Root
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            size="1"
            autoFocus
          />
          
          <div className="flex justify-end gap-2 mt-4">
            <Dialog.Close asChild>
              <Button variant="soft" size="1">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleSubmit}
              disabled={!value.trim()}
              size="1"
            >
              Create
            </Button>
          </div>
        </Dialog.Content>
    </Dialog.Root>
  );
}
