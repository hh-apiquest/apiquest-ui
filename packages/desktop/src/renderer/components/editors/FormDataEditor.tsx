// FormDataEditor - Multipart form-data body editor
// Same visual style as HeadersEditor, ParamsEditor, UrlEncodedEditor.
// Adds a Type column (text / file) for each row.

import React, { useState, useEffect, useRef } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { TextField } from '@radix-ui/themes';
import { TrashIcon } from '@heroicons/react/24/outline';

export interface FormDataEditorProps {
  formData: Array<{
    key: string;
    value: string;
    type: 'text' | 'binary';
    disabled?: boolean;
    description?: string;
  }>;
  onChange: (formData: Array<{
    key: string;
    value: string;
    type: 'text' | 'binary';
    disabled?: boolean;
    description?: string;
  }>) => void;
}

type FormDataRow = {
  key: string;
  value: string;
  type: 'text' | 'binary';
  disabled?: boolean;
  description?: string;
};

export function FormDataEditor({ formData, onChange }: FormDataEditorProps) {
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
  }, [formData.length]);

  const setInputRef = (index: number, field: 'key' | 'value', el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(`${index}-${field}`, el);
    else inputRefs.current.delete(`${index}-${field}`);
  };

  const handleChange = (index: number, field: 'key' | 'value' | 'description' | 'type', value: string) => {
    const next = [...formData];
    if (index >= next.length) {
      next.push({
        key: field === 'key' ? value : '',
        value: field === 'value' ? value : '',
        description: field === 'description' ? value : '',
        type: 'text',
        disabled: false,
      });
      pendingFocus.current = {
        index: next.length - 1,
        field: field === 'description' || field === 'type' ? 'key' : field as 'key' | 'value',
      };
    } else {
      next[index] = { ...next[index], [field]: value } as FormDataRow;
    }
    onChange(next);
  };

  const handleToggle = (index: number) => {
    const next = [...formData];
    next[index] = { ...next[index], disabled: !next[index].disabled };
    onChange(next);
  };

  const handleDelete = (index: number) => {
    onChange(formData.filter((_, i) => i !== index));
  };

  // Add placeholder empty row at the end for new-entry UX
  const displayRows: FormDataRow[] = [...formData, { key: '', value: '', type: 'text', disabled: false, description: '' }];

  return (
    <div className="fd-editor" style={{ fontFamily: 'inherit' }}>
      <style>{`
        .fd-editor table { width: 100%; border-collapse: collapse; }

        .fd-editor thead tr th {
          text-align: left;
          font-size: 11px;
          font-weight: 500;
          color: var(--gray-9);
          padding: 4px 6px;
          border-bottom: 1px solid var(--gray-6);
          white-space: nowrap;
        }

        .fd-editor tbody tr.fd-row { border-bottom: 1px solid var(--gray-5); }
        .fd-editor tbody tr td { padding: 2px 6px; }

        .fd-editor .fd-row { transition: opacity 130ms ease; }
        .fd-editor .fd-row-empty { opacity: 0.38; }
        .fd-editor .fd-row-empty:hover { opacity: 0.6; }
        .fd-editor .fd-row-disabled { opacity: 0.4; }

        .fd-editor .fd-cb {
          width: 14px; height: 14px; border-radius: 3px;
          border: 1px solid var(--gray-7);
          background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .fd-editor .fd-cb[data-state="checked"] {
          background: var(--accent-9); border-color: var(--accent-9);
        }
        .fd-editor .fd-cb-ind { color: white; display: flex; align-items: center; }

        .fd-editor .fd-type-select {
          font-size: 11px;
          color: var(--gray-10);
          background: var(--gray-3);
          border: 1px solid var(--gray-6);
          border-radius: 4px;
          padding: 1px 4px;
          cursor: pointer;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .fd-editor .fd-type-select:focus {
          outline: 2px solid var(--accent-8);
          outline-offset: 1px;
        }
        .fd-editor .fd-type-select:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .fd-editor .fd-del {
          color: var(--gray-8); background: none; border: none;
          cursor: pointer; padding: 2px; transition: color 100ms; line-height: 0;
        }
        .fd-editor .fd-del:hover { color: var(--red-9); }
      `}</style>

      <table>
        <thead>
          <tr>
            <th style={{ width: 26 }} />
            <th style={{ width: '32%' }}>Key</th>
            <th style={{ width: '30%' }}>Value</th>
            <th>Description</th>
            <th style={{ width: 26 }} />
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, index) => {
            const isEmptyRow = index === formData.length;
            const isActive = isEmptyRow && focusedRow === index;
            const isEnabled = !row.disabled;
            const isDisabled = !isEnabled && !isEmptyRow;

            const rowKey = isEmptyRow ? 'add-row' : `fd-row-${index}`;
            const rowClass = [
              'fd-row',
              isDisabled ? 'fd-row-disabled' : '',
              isEmptyRow && !isActive ? 'fd-row-empty' : '',
            ].filter(Boolean).join(' ');

            return (
              <tr key={rowKey} className={rowClass}>
                <td style={{ textAlign: 'center', width: 26 }}>
                  {!isEmptyRow && (
                    <Checkbox.Root
                      checked={isEnabled}
                      onCheckedChange={() => handleToggle(index)}
                      className="fd-cb"
                    >
                      <Checkbox.Indicator className="fd-cb-ind">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M10 3L4.5 8.5L2 6"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                  )}
                </td>

                {/* Key with inline type selector as a suffix badge */}
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <TextField.Root
                      size="1"
                      ref={(el) => setInputRef(index, 'key', el)}
                      value={row.key}
                      onChange={(e) => handleChange(index, 'key', e.target.value)}
                      onFocus={() => setFocusedRow(index)}
                      onBlur={() => setFocusedRow(null)}
                      placeholder={isEmptyRow ? 'Key' : ''}
                      disabled={isDisabled}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    {!isEmptyRow && (
                      <select
                        value={row.type}
                        onChange={(e) => handleChange(index, 'type', e.target.value)}
                        disabled={isDisabled}
                        className="fd-type-select"
                      >
                        <option value="text">Text</option>
                        <option value="binary">File</option>
                      </select>
                    )}
                  </div>
                </td>

                <td>
                  <TextField.Root
                    size="1"
                    ref={(el) => setInputRef(index, 'value', el)}
                    value={row.value}
                    onChange={(e) => handleChange(index, 'value', e.target.value)}
                    onFocus={() => setFocusedRow(index)}
                    onBlur={() => setFocusedRow(null)}
                    placeholder={isEmptyRow ? 'Value' : (row.type === 'binary' ? 'File path' : '')}
                    disabled={isDisabled}
                    style={{ width: '100%' }}
                  />
                </td>

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

                <td style={{ textAlign: 'center', width: 26 }}>
                  {!isEmptyRow && (
                    <button
                      onClick={() => handleDelete(index)}
                      className="fd-del"
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
