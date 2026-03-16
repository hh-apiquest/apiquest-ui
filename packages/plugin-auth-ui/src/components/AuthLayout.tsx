import React from 'react';
import * as RT from '@radix-ui/themes';

export type AuthFieldProps = {
  label: string;
  children: React.ReactNode;
};

export function AuthField({ label, children }: AuthFieldProps): React.ReactElement {
  return (
    <RT.Box>
      <RT.Text as="label" size="2" weight="medium" style={{ display: 'block', marginBottom: 4 }}>
        {label}
      </RT.Text>
      {children}
    </RT.Box>
  );
}

export type AuthStackProps = {
  children: React.ReactNode;
};

export function AuthStack({ children }: AuthStackProps): React.ReactElement {
  return (
    <RT.Flex direction="column" gap="3" style={{ width: '100%' }}>
      {children}
    </RT.Flex>
  );
}

export const textFieldStyles: React.CSSProperties = {
  width: '100%',
};

