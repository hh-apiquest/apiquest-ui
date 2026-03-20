import type { CSSProperties } from 'react';

import type { TreeDropPosition } from './types';

export function getDropIndicatorStyle(isOver: boolean, isValid: boolean, position: TreeDropPosition): CSSProperties {
  if (!isOver) {
    return {
      background: 'transparent',
    };
  }

  const color = isValid ? 'var(--green-9)' : 'var(--red-9)';

  if (position === 'inside') {
    return {
      background: isValid ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
      outline: `1px solid ${color}`,
      borderRadius: '6px',
    };
  }

  return {
    background: color,
    borderRadius: '999px',
    boxShadow: `0 0 0 1px ${color}`,
  };
}
