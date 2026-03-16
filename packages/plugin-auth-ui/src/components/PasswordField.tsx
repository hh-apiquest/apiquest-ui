import React from 'react';
import * as RT from '@radix-ui/themes';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

export type PasswordFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
};

export function PasswordField({
  value,
  onChange,
  placeholder,
  disabled,
}: PasswordFieldProps): React.ReactElement {
  const [visible, setVisible] = React.useState<boolean>(false);

  return (
    <RT.TextField.Root
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value);
      }}
      placeholder={placeholder}
      size="2"
      style={{ width: '100%' }}
      disabled={disabled}
    >
      <RT.TextField.Slot side="right">
        <button
          type="button"
          onClick={() => {
            setVisible((previous) => !previous);
          }}
          disabled={disabled}
          aria-label={visible ? 'Hide value' : 'Show value'}
          style={{
            border: 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: 0,
            margin: 0,
          }}
        >
          {visible ? <EyeSlashIcon width={16} height={16} /> : <EyeIcon width={16} height={16} />}
        </button>
      </RT.TextField.Slot>
    </RT.TextField.Root>
  );
}

