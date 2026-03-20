import type { RefObject } from 'react';
import { TextField } from '@radix-ui/themes';

type InlineRenameFieldProps = {
  inputRef: RefObject<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
};

export function InlineRenameField({
  inputRef,
  value,
  onChange,
  onSubmit,
  onCancel,
}: InlineRenameFieldProps) {
  return (
    <TextField.Root
      ref={inputRef}
      size="1"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        void onSubmit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          void onSubmit();
        } else if (event.key === 'Escape') {
          onCancel();
        }
      }}
      style={{ flex: 1 }}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
