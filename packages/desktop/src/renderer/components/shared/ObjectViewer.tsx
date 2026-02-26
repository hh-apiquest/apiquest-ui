import { useState } from 'react';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface ObjectViewerProps {
  data: unknown;
  depth?: number;
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 4;

function renderPrimitive(value: unknown) {
  if (value === null) {
    return <span style={{ color: 'var(--gray-10)' }}>null</span>;
  }
  if (value === undefined) {
    return <span style={{ color: 'var(--gray-9)' }}>undefined</span>;
  }

  const valueType = typeof value;

  if (valueType === 'string') {
    return <span style={{ color: 'var(--green-10)' }}>&quot;{String(value)}&quot;</span>;
  }
  if (valueType === 'number') {
    return <span style={{ color: 'var(--blue-10)' }}>{String(value)}</span>;
  }
  if (valueType === 'boolean') {
    return <span style={{ color: 'var(--purple-10)' }}>{String(value)}</span>;
  }
  if (valueType === 'bigint') {
    return <span style={{ color: 'var(--blue-10)' }}>{String(value)}</span>;
  }
  if (valueType === 'symbol') {
    return <span style={{ color: 'var(--gray-9)' }}>{String(value)}</span>;
  }
  if (valueType === 'function') {
    return <span style={{ color: 'var(--gray-9)' }}>[Function]</span>;
  }

  if (value === '[Circular]') {
    return <span style={{ color: 'var(--orange-10)' }}>[Circular]</span>;
  }

  return null;
}

export function ObjectViewer({ data, depth = 0, maxDepth = DEFAULT_MAX_DEPTH }: ObjectViewerProps) {
  const [isExpanded, setIsExpanded] = useState(depth === 0);

  const primitive = renderPrimitive(data);
  if (primitive) {
    return primitive;
  }

  if (typeof data !== 'object' || data === null) {
    return <span style={{ color: 'var(--gray-9)' }}>{String(data)}</span>;
  }

  const isArray = Array.isArray(data);
  const entries = isArray
    ? (data as unknown[]).map((value, index) => [String(index), value] as const)
    : Object.entries(data as Record<string, unknown>);

  if (depth >= maxDepth) {
    return (
      <span style={{ color: 'var(--gray-9)' }}>
        {isArray ? `[${entries.length}]` : `{${entries.length}}`}
      </span>
    );
  }

  if (entries.length === 0) {
    return (
      <span style={{ color: 'var(--gray-9)' }}>
        {isArray ? '[]' : '{}'}
      </span>
    );
  }

  return (
    <div className="inline-block font-mono">
      <span
        className="cursor-pointer hover:underline inline-flex items-center gap-0.5"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ color: 'var(--gray-11)' }}
      >
        {isExpanded ? (
          <ChevronDownIcon className="w-3 h-3" />
        ) : (
          <ChevronRightIcon className="w-3 h-3" />
        )}
        {isArray ? `[${entries.length}]` : `{${entries.length}}`}
      </span>

      {isExpanded && (
        <div className="ml-3 mt-0.5 border-l-2 pl-2" style={{ borderColor: 'var(--gray-6)' }}>
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-1.5 items-start py-0.5">
              <span style={{ color: 'var(--purple-9)' }}>{key}:</span>
              <ObjectViewer data={value} depth={depth + 1} maxDepth={maxDepth} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
