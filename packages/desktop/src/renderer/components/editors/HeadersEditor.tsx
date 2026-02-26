// HeadersEditor - HTTP headers editor
// Wrapper around KeyValueEditor with headers-specific features

import React, { useState, useEffect, useRef } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { TextField } from '@radix-ui/themes';
import { ChevronDownIcon, ChevronRightIcon, TrashIcon } from '@heroicons/react/24/outline';

export interface HeadersEditorProps {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
  presetHeaders?: Record<string, string>;
}

interface KeyValueEditorProps {
  data: Array<{ key: string; value: string; enabled: boolean }>;
  onChange: (data: Array<{ key: string; value: string; enabled: boolean }>) => void;
  placeholder?: { key: string; value: string };
  allowDisable?: boolean;
  allowDuplicates?: boolean;
  // Optional callbacks for autocomplete suggestions
  getKeySuggestions?: () => string[];
  getValueSuggestions?: (key: string) => string[];
}

// Common HTTP headers for autocomplete
const COMMON_HEADERS = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Type',
  'Content-Length',
  'Cookie',
  'DNT',
  'Host',
  'If-Modified-Since',
  'If-None-Match',
  'Origin',
  'Pragma',
  'Referer',
  'User-Agent',
  'X-Requested-With',
  'X-CSRF-Token',
  'X-API-Key',
];

// Common values for specific headers
const HEADER_VALUES: Record<string, string[]> = {
  'Content-Type': [
    'application/json',
    'application/xml',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    'text/html',
    'text/xml',
  ],
  'Accept': [
    'application/json',
    'application/xml',
    'text/plain',
    'text/html',
    '*/*',
  ],
  'Accept-Encoding': [
    'gzip, deflate, br',
    'gzip, deflate',
    'gzip',
  ],
  'Accept-Language': [
    'en-US,en;q=0.9',
    'en',
  ],
  'Cache-Control': [
    'no-cache',
    'no-store',
    'max-age=0',
    'must-revalidate',
  ],
  'Connection': [
    'keep-alive',
    'close',
  ],
};

function KeyValueEditor({
  data,
  onChange,
  placeholder = { key: 'Key', value: 'Value' },
  allowDisable = true,
  allowDuplicates = true,
  getKeySuggestions,
  getValueSuggestions
}: KeyValueEditorProps) {
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocus = useRef<{ index: number; field: 'key' | 'value' } | null>(null);

  useEffect(() => {
    // Restore focus after a new row is created
    if (pendingFocus.current) {
      const { index, field } = pendingFocus.current;
      const key = `${index}-${field}`;
      const input = inputRefs.current.get(key);
      if (input) {
        input.focus();
        // Move cursor to end
        const length = input.value.length;
        input.setSelectionRange(length, length);
      }
      pendingFocus.current = null;
    }
  }, [data.length]);

  const handleChange = (index: number, field: 'key' | 'value', newValue: string) => {
    const newData = [...data];

    if (index >= newData.length) {
      // Typing in the empty "add" row - create a new entry
      newData.push({
        key: field === 'key' ? newValue : '',
        value: field === 'value' ? newValue : '',
        enabled: true
      });
      // Schedule focus restoration to the newly created row
      pendingFocus.current = { index: newData.length - 1, field };
    } else {
      // Updating existing row
      newData[index] = { ...newData[index], [field]: newValue };
    }

    onChange(newData);
  };

  const setInputRef = (index: number, field: 'key' | 'value', element: HTMLInputElement | null) => {
    const key = `${index}-${field}`;
    if (element) {
      inputRefs.current.set(key, element);
    } else {
      inputRefs.current.delete(key);
    }
  };

  const handleToggle = (index: number) => {
    const newData = [...data];
    newData[index] = { ...newData[index], enabled: !newData[index].enabled };
    onChange(newData);
  };

  const handleDelete = (index: number) => {
    const newData = data.filter((_, i) => i !== index);
    onChange(newData);
  };

  const handleFocus = (index: number) => {
    setFocusedRow(index);
  };

  const handleBlur = () => {
    setFocusedRow(null);
  };

  // Always show data rows + one empty row for adding
  const displayRows = [...data, { key: '', value: '', enabled: true }];

  return (
    <div className="key-value-editor">
      <style>{`
        .kv-row {
          transition: opacity 150ms ease;
        }
        .kv-row-empty {
          opacity: 0.4;
        }
        .kv-row-empty:hover {
          opacity: 0.6;
        }
        .kv-row-disabled {
          opacity: 0.5;
        }
        .kv-checkbox {
          background: var(--color-background);
          border-color: var(--gray-6);
        }
        .kv-checkbox:hover {
          background: var(--gray-2);
        }
        .kv-checkbox[data-state="checked"] {
          background: var(--accent-9);
          border-color: var(--accent-9);
        }
        .kv-checkbox-indicator {
          color: white;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .kv-input {
          border: 1px solid var(--gray-6);
          color: var(--gray-12);
          background: transparent;
        }
        .kv-input:focus {
          outline: 2px solid var(--accent-8);
          outline-offset: 1px;
        }
        .kv-input:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .kv-input-empty {
          font-style: italic;
        }
        .kv-delete-button {
          color: var(--gray-9);
        }
        .kv-delete-button:hover {
          color: var(--red-9);
        }
      `}</style>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            {allowDisable && (
              <th className="w-10 px-2 py-2 text-left text-xs font-medium" style={{ color: 'var(--gray-9)' }}>
              </th>
            )}
            <th className="px-2 py-2 text-left text-xs font-medium" style={{ color: 'var(--gray-9)' }}>
              Key
            </th>
            <th className="px-2 py-2 text-left text-xs font-medium" style={{ color: 'var(--gray-9)' }}>
              Value
            </th>
            <th className="w-10 px-2 py-2">

            </th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, index) => {
            const isEmptyRow = index === data.length;
            const isActive = isEmptyRow && focusedRow === index;
            const isDisabled = !row.enabled && !isEmptyRow;

            // Use stable keys - for data rows use index, for empty row use special key
            const rowKey = isEmptyRow ? 'empty-add-row' : `data-row-${index}`;
            const rowClassName = [
              'kv-row',
              'border-b',
              isDisabled ? 'kv-row-disabled' : '',
              isEmptyRow && !isActive ? 'kv-row-empty' : ''
            ].filter(Boolean).join(' ');

            return (
              <tr
                key={rowKey}
                className={rowClassName}
              >
                {allowDisable && (
                  <td className="px-2 py-1">
                    {!isEmptyRow && (
                      <Checkbox.Root
                        checked={row.enabled}
                        onCheckedChange={() => handleToggle(index)}
                        className="kv-checkbox flex items-center justify-center w-4 h-4 rounded border"
                      >
                        <Checkbox.Indicator className="kv-checkbox-indicator">
                          <svg
                            className="w-3 h-3"
                            viewBox="0 0 12 12"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M10 3L4.5 8.5L2 6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                    )}
                  </td>
                )}
                <td className="px-2 py-1">
                  <TextField.Root
                    size="1"
                    ref={(el) => setInputRef(index, 'key', el)}
                    value={row.key}
                    onChange={(e) => handleChange(index, 'key', e.target.value)}
                    onFocus={() => handleFocus(index)}
                    onBlur={handleBlur}
                    placeholder={isEmptyRow ? placeholder.key : ''}
                    disabled={isDisabled}
                    list={getKeySuggestions ? `key-suggestions-${index}` : undefined}
                    className={`w-full ${isEmptyRow ? 'kv-input-empty' : ''}`}
                  />
                  {getKeySuggestions && (
                    <datalist id={`key-suggestions-${index}`}>
                      {getKeySuggestions().map((suggestion, i) => (
                        <option key={i} value={suggestion} />
                      ))}
                    </datalist>
                  )}
                </td>
                <td className="px-2 py-1">
                  <TextField.Root
                    size="1"
                    ref={(el) => setInputRef(index, 'value', el)}
                    value={row.value}
                    onChange={(e) => handleChange(index, 'value', e.target.value)}
                    onFocus={() => handleFocus(index)}
                    onBlur={handleBlur}
                    placeholder={isEmptyRow ? placeholder.value : ''}
                    disabled={isDisabled}
                    list={getValueSuggestions && row.key ? `value-suggestions-${index}` : undefined}
                    className={`w-full ${isEmptyRow ? 'kv-input-empty' : ''}`}
                  />
                  {getValueSuggestions && row.key && (
                    <datalist id={`value-suggestions-${index}`}>
                      {getValueSuggestions(row.key).map((suggestion, i) => (
                        <option key={i} value={suggestion} />
                      ))}
                    </datalist>
                  )}
                </td>
                <td className="px-2 py-1 text-center">
                  {!isEmptyRow && (
                    <button
                      onClick={() => handleDelete(index)}
                      className="kv-delete-button p-1 transition-colors"
                      title="Delete"
                      type="button"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HeadersEditor({ headers, onChange, presetHeaders }: HeadersEditorProps) {
  // Maintain full data with enabled state internally
  const [data, setData] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [presetExpanded, setPresetExpanded] = useState(false);

  // Initialize data from headers prop
  useEffect(() => {
    const newData = Object.entries(headers).map(([key, value]) => ({
      key,
      value,
      enabled: true
    }));
    setData(newData);
  }, [headers]);

  const handleChange = (newData: Array<{ key: string; value: string; enabled: boolean }>) => {
    // Store the full data including disabled rows
    setData(newData);
    
    // Convert array back to object, only including enabled headers for the actual request
    const newHeaders: Record<string, string> = {};
    newData
      .filter(item => item.enabled && item.key.trim() !== '')
      .forEach(item => {
        newHeaders[item.key] = item.value;
      });
    
    onChange(newHeaders);
  };

  const getKeySuggestions = () => COMMON_HEADERS;

  const getValueSuggestions = (key: string) => {
    return HEADER_VALUES[key] || [];
  };

  const hasPresetHeaders = presetHeaders && Object.keys(presetHeaders).length > 0;

  return (
    <div className="headers-editor flex flex-col gap-2">
      <style>{`
        .preset-toggle {
          color: var(--gray-11);
        }
        .preset-toggle:hover {
          background: var(--gray-2);
        }
        .preset-row:last-child {
          border-bottom: none;
        }
      `}</style>
      {/* Preset Headers Section */}
      {hasPresetHeaders && (
        <div className="border rounded">
          <button
            onClick={() => setPresetExpanded(!presetExpanded)}
            className="preset-toggle w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors"
            type="button"
          >
            <span className="flex items-center gap-2">
              {presetExpanded ? (
                <ChevronDownIcon className="w-4 h-4" />
              ) : (
                <ChevronRightIcon className="w-4 h-4" />
              )}
              Preset Headers ({Object.keys(presetHeaders).length})
            </span>
            <span className="text-xs" style={{ color: 'var(--gray-9)' }}>
              Auto-generated
            </span>
          </button>

          {presetExpanded && (
            <div className="border-t p-2">
              <table className="w-full border-collapse">
                <tbody>
                  {Object.entries(presetHeaders).map(([key, value], index) => (
                    <tr
                      key={index}
                      className="preset-row border-b"
                    >
                      <td className="px-2 py-1 text-sm font-mono" style={{ color: 'var(--gray-10)' }}>
                        {key}
                      </td>
                      <td className="px-2 py-1 text-sm font-mono" style={{ color: 'var(--gray-9)' }}>
                        {value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* User Headers Section */}
      <div>
        <KeyValueEditor
          data={data}
          onChange={handleChange}
          placeholder={{ key: 'Header name', value: 'Header value' }}
          allowDisable={true}
          getKeySuggestions={getKeySuggestions}
          getValueSuggestions={getValueSuggestions}
        />
      </div>
    </div>
  );
}
