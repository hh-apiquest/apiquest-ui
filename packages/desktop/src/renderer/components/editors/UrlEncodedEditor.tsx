import React, { useState, useEffect, useRef } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { TextField } from '@radix-ui/themes';
import { TrashIcon } from '@heroicons/react/24/outline';

interface KeyValuePair {
  disabled?: boolean;
  key: string;
  value: string;
  description?: string;
}

export interface UrlEncodedEditorProps {
  data: KeyValuePair[];
  onChange: (data: KeyValuePair[]) => void;
}

export function UrlEncodedEditor({ data, onChange }: UrlEncodedEditorProps) {
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocus = useRef<{ index: number; field: 'key' | 'value' } | null>(null);

  useEffect(() => {
    if (pendingFocus.current) {
      const { index, field } = pendingFocus.current;
      const el = inputRefs.current.get(`${index}-${field}`);
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
      pendingFocus.current = null;
    }
  }, [data.length]);

  const setInputRef = (index: number, field: 'key' | 'value', el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(`${index}-${field}`, el);
    else inputRefs.current.delete(`${index}-${field}`);
  };

  const handleChange = (index: number, field: 'key' | 'value' | 'description', value: string) => {
    const next = [...data];
    if (index >= next.length) {
      next.push({
        key: field === 'key' ? value : '',
        value: field === 'value' ? value : '',
        description: field === 'description' ? value : '',
        disabled: false,
      });
      pendingFocus.current = {
        index: next.length - 1,
        field: field === 'description' ? 'key' : field as 'key' | 'value',
      };
    } else {
      next[index] = { ...next[index], [field]: value };
    }
    onChange(next);
  };

  const handleToggle = (index: number) => {
    const next = [...data];
    next[index] = { ...next[index], disabled: !next[index].disabled };
    onChange(next);
  };

  const handleDelete = (index: number) => {
    onChange(data.filter((_, i) => i !== index));
  };

  // Add placeholder empty row at the end for new-entry UX
  const displayRows = [...data, { key: '', value: '', description: '', disabled: false }];

  return (
    <div className="ue-editor" style={{ fontFamily: 'inherit' }}>
      <style>{`
        .ue-editor table { width: 100%; border-collapse: collapse; }

        .ue-editor thead tr th {
          text-align: left;
          font-size: 11px;
          font-weight: 500;
          color: var(--gray-9);
          padding: 4px 6px;
          border-bottom: 1px solid var(--gray-6);
          white-space: nowrap;
        }

        .ue-editor tbody tr.ue-row { border-bottom: 1px solid var(--gray-5); }
        .ue-editor tbody tr td { padding: 2px 6px; }

        .ue-editor .ue-row { transition: opacity 130ms ease; }
        .ue-editor .ue-row-empty { opacity: 0.38; }
        .ue-editor .ue-row-empty:hover { opacity: 0.6; }
        .ue-editor .ue-row-disabled { opacity: 0.4; }

        .ue-editor .ue-cb {
          width: 14px; height: 14px; border-radius: 3px;
          border: 1px solid var(--gray-7);
          background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .ue-editor .ue-cb[data-state="checked"] {
          background: var(--accent-9); border-color: var(--accent-9);
        }
        .ue-editor .ue-cb-ind { color: white; display: flex; align-items: center; }

        .ue-editor .ue-del {
          color: var(--gray-8); background: none; border: none;
          cursor: pointer; padding: 2px; transition: color 100ms; line-height: 0;
        }
        .ue-editor .ue-del:hover { color: var(--red-9); }
      `}</style>

      <table>
        <thead>
          <tr>
            <th style={{ width: 26 }} />
            <th style={{ width: '28%' }}>Key</th>
            <th style={{ width: '30%' }}>Value</th>
            <th>Description</th>
            <th style={{ width: 26 }} />
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, index) => {
            const isEmptyRow = index === data.length;
            const isActive = isEmptyRow && focusedRow === index;
            // disabled is inverted relative to headers/params - 'disabled: true' means off
            const isEnabled = !row.disabled;
            const isDisabled = !isEnabled && !isEmptyRow;

            const rowKey = isEmptyRow ? 'add-row' : `ue-row-${index}`;
            const rowClass = [
              'ue-row',
              isDisabled ? 'ue-row-disabled' : '',
              isEmptyRow && !isActive ? 'ue-row-empty' : '',
            ].filter(Boolean).join(' ');

            return (
              <tr key={rowKey} className={rowClass}>
                {/* Checkbox */}
                <td style={{ textAlign: 'center', width: 26 }}>
                  {!isEmptyRow && (
                    <Checkbox.Root
                      checked={isEnabled}
                      onCheckedChange={() => handleToggle(index)}
                      className="ue-cb"
                    >
                      <Checkbox.Indicator className="ue-cb-ind">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M10 3L4.5 8.5L2 6"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                  )}
                </td>

                {/* Key */}
                <td>
                  <TextField.Root
                    size="1"
                    ref={(el) => setInputRef(index, 'key', el)}
                    value={row.key}
                    onChange={(e) => handleChange(index, 'key', e.target.value)}
                    onFocus={() => setFocusedRow(index)}
                    onBlur={() => setFocusedRow(null)}
                    placeholder={isEmptyRow ? 'Key' : ''}
                    disabled={isDisabled}
                    style={{ width: '100%' }}
                  />
                </td>

                {/* Value */}
                <td>
                  <TextField.Root
                    size="1"
                    ref={(el) => setInputRef(index, 'value', el)}
                    value={row.value}
                    onChange={(e) => handleChange(index, 'value', e.target.value)}
                    onFocus={() => setFocusedRow(index)}
                    onBlur={() => setFocusedRow(null)}
                    placeholder={isEmptyRow ? 'Value' : ''}
                    disabled={isDisabled}
                    style={{ width: '100%' }}
                  />
                </td>

                {/* Description */}
                <td>
                  <TextField.Root
                    size="1"
                    value={row.description || ''}
                    onChange={(e) => handleChange(index, 'description', e.target.value)}
                    onFocus={() => setFocusedRow(index)}
                    onBlur={() => setFocusedRow(null)}
                    placeholder={isEmptyRow ? 'Description' : ''}
                    disabled={isDisabled}
                    style={{ width: '100%' }}
                  />
                </td>

                {/* Delete */}
                <td style={{ textAlign: 'center', width: 26 }}>
                  {!isEmptyRow && (
                    <button
                      onClick={() => handleDelete(index)}
                      className="ue-del"
                      title="Delete"
                      type="button"
                    >
                      <TrashIcon style={{ width: 14, height: 14 }} />
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
