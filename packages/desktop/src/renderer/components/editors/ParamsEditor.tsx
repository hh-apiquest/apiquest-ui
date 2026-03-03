import React, { useState, useEffect, useRef } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { TextField } from '@radix-ui/themes';
import { TrashIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import type { ParamEntry, GeneratedParamEntry, ParamsEditorState } from '@apiquest/plugin-ui-types';

export interface ParamsEditorProps {
  /** Full editor model - ParamEntry[] with enabled/disabled state. */
  params: ParamEntry[];
  /** Called on every change with the updated full row list (including disabled rows). */
  onChange: (params: ParamEntry[]) => void;
  /** Read-only generated params from protocol plugin (auth type, etc.). */
  generatedParams?: GeneratedParamEntry[];
  /** Controlled editor panel state (stored in request.data._ui.paramsEditorState). */
  editorState?: ParamsEditorState;
  /** Called when any editor panel state changes (e.g. generated section toggle). */
  onEditorStateChange?: (state: ParamsEditorState) => void;
}

export function ParamsEditor({ params, onChange, generatedParams, editorState, onEditorStateChange }: ParamsEditorProps) {
  // Controlled mode: use editorState from parent; uncontrolled: local state
  const [localGeneratedVisible, setLocalGeneratedVisible] = useState(false);
  const generatedVisible = editorState !== undefined
    ? (editorState.generatedVisible ?? false)
    : localGeneratedVisible;

  const setGeneratedVisible = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(generatedVisible) : v;
    if (onEditorStateChange) {
      onEditorStateChange({ ...(editorState ?? {}), generatedVisible: next });
    } else {
      setLocalGeneratedVisible(next);
    }
  };

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
  }, [params.length]);

  const setInputRef = (index: number, field: 'key' | 'value', el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(`${index}-${field}`, el);
    else inputRefs.current.delete(`${index}-${field}`);
  };

  const handleChange = (index: number, field: keyof ParamEntry, value: string | boolean) => {
    const next = [...params];
    if (index >= next.length) {
      next.push({
        key: field === 'key' ? String(value) : '',
        value: field === 'value' ? String(value) : '',
        description: field === 'description' ? String(value) : '',
        enabled: true,
      });
      pendingFocus.current = {
        index: next.length - 1,
        field: field === 'description' ? 'key' : (field as 'key' | 'value'),
      };
    } else {
      next[index] = { ...next[index], [field]: value };
    }
    onChange(next);
  };

  const handleToggle = (index: number) => {
    const next = [...params];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    onChange(next);
  };

  const handleDelete = (index: number) => {
    onChange(params.filter((_, i) => i !== index));
  };

  const genCount = generatedParams?.length ?? 0;
  const hasGenerated = genCount > 0;

  const manualKeySet = new Set(
    params.filter(r => r.enabled && r.key.trim()).map(r => r.key.toLowerCase())
  );

  const displayRows = [...params, { key: '', value: '', description: '', enabled: true }];

  return (
    <div className="prm-editor" style={{ fontFamily: 'inherit' }}>
      <style>{`
        .prm-editor table { width: 100%; border-collapse: collapse; }

        .prm-editor thead tr th {
          text-align: left;
          font-size: 11px;
          font-weight: 500;
          color: var(--gray-9);
          padding: 4px 6px;
          border-bottom: 1px solid var(--gray-6);
          white-space: nowrap;
        }

        .prm-editor tbody tr.prm-row,
        .prm-editor tbody tr.gen-row { border-bottom: 1px solid var(--gray-5); }
        .prm-editor tbody tr td { padding: 2px 6px; }

        .prm-editor .prm-row { transition: opacity 130ms ease; }
        .prm-editor .prm-row-empty { opacity: 0.38; }
        .prm-editor .prm-row-empty:hover { opacity: 0.6; }
        .prm-editor .prm-row-disabled { opacity: 0.4; }

        .prm-editor .prm-cb {
          width: 14px; height: 14px; border-radius: 3px;
          border: 1px solid var(--gray-7);
          background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .prm-editor .prm-cb[data-state="checked"] {
          background: var(--accent-9); border-color: var(--accent-9);
        }
        .prm-editor .prm-cb-ind { color: white; display: flex; align-items: center; }

        .prm-editor .prm-del {
          color: var(--gray-8); background: none; border: none;
          cursor: pointer; padding: 2px; transition: color 100ms; line-height: 0;
        }
        .prm-editor .prm-del:hover { color: var(--red-9); }

        .prm-editor .gen-row { background: var(--gray-2); }
        .prm-editor .gen-row-overridden { opacity: 0.45; }
        .prm-editor .gen-badge {
          font-size: 10px; padding: 0 4px; border-radius: 3px; line-height: 16px;
          background: var(--amber-4); color: var(--amber-11); border: 1px solid var(--amber-6);
        }
        .prm-editor .gen-src { font-size: 11px; color: var(--gray-8); font-style: italic; }
        .prm-editor .gen-lock { line-height: 0; opacity: 0.5; }
        .prm-editor .gen-divider td { padding: 0; height: 1px; background: var(--gray-7); border: none; }

        .prm-editor .gen-toggle-btn {
          display: inline-flex; align-items: center; gap: 4px;
          background: none; border: none; padding: 0;
          cursor: pointer; white-space: nowrap;
          font-size: 11px; font-weight: 500; color: var(--gray-9);
          transition: color 100ms;
        }
        .prm-editor .gen-toggle-btn:hover { color: var(--gray-12); }
        .prm-editor .gen-toggle-btn svg { width: 13px; height: 13px; flex-shrink: 0; }
      `}</style>

      <table>
        <thead>
          <tr>
            <th style={{ width: 26 }} />
            <th style={{ width: '28%' }}>Key</th>
            <th style={{ width: '30%' }}>Value</th>
            <th>Description</th>
            <th style={{ width: 26, textAlign: 'right' }}>
              {hasGenerated && (
                <button
                  type="button"
                  className="gen-toggle-btn"
                  title={generatedVisible ? 'Hide generated params' : 'Show generated params'}
                  onClick={() => setGeneratedVisible(v => !v)}
                >
                  {generatedVisible ? <EyeIcon /> : <EyeSlashIcon />}
                  <span>{genCount}&nbsp;auto</span>
                </button>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {hasGenerated && generatedVisible && (
            <>
              {generatedParams!.map((entry, i) => {
                const isOverridden = manualKeySet.has(entry.key.toLowerCase());
                return (
                  <tr key={`gen-${i}`} className={`gen-row${isOverridden ? ' gen-row-overridden' : ''}`}>
                    <td className="gen-lock" style={{ textAlign: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="var(--gray-9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </td>
                    <td>
                      <TextField.Root size="1" value={entry.key} disabled readOnly style={{ width: '100%' }} />
                    </td>
                    <td>
                      <TextField.Root size="1" value={entry.value} disabled readOnly style={{ width: '100%' }} />
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="gen-src">{entry.source}</span>
                        {entry.description && <span className="gen-src">— {entry.description}</span>}
                        {isOverridden && <span className="gen-badge">overridden</span>}
                      </span>
                    </td>
                    <td />
                  </tr>
                );
              })}
              <tr className="gen-divider"><td colSpan={5} /></tr>
            </>
          )}

          {displayRows.map((row, index) => {
            const isEmptyRow = index === params.length;
            const isActive = isEmptyRow && focusedRow === index;
            const isDisabled = !row.enabled && !isEmptyRow;

            const rowKey = isEmptyRow ? 'add-row' : `prm-row-${index}`;
            const rowClass = [
              'prm-row',
              isDisabled ? 'prm-row-disabled' : '',
              isEmptyRow && !isActive ? 'prm-row-empty' : '',
            ].filter(Boolean).join(' ');

            return (
              <tr key={rowKey} className={rowClass}>
                <td style={{ textAlign: 'center', width: 26 }}>
                  {!isEmptyRow && (
                    <Checkbox.Root checked={row.enabled} onCheckedChange={() => handleToggle(index)} className="prm-cb">
                      <Checkbox.Indicator className="prm-cb-ind">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                  )}
                </td>
                <td>
                  <TextField.Root
                    size="1"
                    ref={(el) => setInputRef(index, 'key', el)}
                    value={row.key}
                    onChange={(e) => handleChange(index, 'key', e.target.value)}
                    onFocus={() => setFocusedRow(index)}
                    onBlur={() => setFocusedRow(null)}
                    placeholder={isEmptyRow ? 'Parameter name' : ''}
                    disabled={isDisabled}
                    style={{ width: '100%' }}
                  />
                </td>
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
                    <button onClick={() => handleDelete(index)} className="prm-del" title="Delete" type="button">
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
