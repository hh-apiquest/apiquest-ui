import React, { useState, useEffect, useRef } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { TextField } from '@radix-ui/themes';
import { TrashIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import type { HeaderEntry, GeneratedHeaderEntry, HeadersEditorState } from '@apiquest/plugin-ui-types';

export interface HeadersEditorProps {
  /** Full editor model - HeaderEntry[] with enabled/disabled state. */
  headers: HeaderEntry[];
  /** Called on every change with the updated full row list (including disabled rows). */
  onChange: (headers: HeaderEntry[]) => void;
  /** Read-only generated headers from protocol plugin (body mode, auth, etc.). */
  generatedHeaders?: GeneratedHeaderEntry[];
  /**
   * Controlled editor panel state (stored in request.data._ui.headersEditorState).
   * If provided, the component operates in controlled mode for panel visibility.
   */
  editorState?: HeadersEditorState;
  /** Called when any editor panel state changes (e.g. generated section toggle). */
  onEditorStateChange?: (state: HeadersEditorState) => void;
}

const COMMON_HEADERS = [
  'Accept', 'Accept-Charset', 'Accept-Encoding', 'Accept-Language',
  'Authorization', 'Cache-Control', 'Connection', 'Content-Type',
  'Content-Length', 'Cookie', 'DNT', 'Host', 'If-Modified-Since',
  'If-None-Match', 'Origin', 'Pragma', 'Referer', 'User-Agent',
  'X-Requested-With', 'X-CSRF-Token', 'X-API-Key',
];

const HEADER_VALUES: Record<string, string[]> = {
  'Content-Type': [
    'application/json', 'application/xml',
    'application/x-www-form-urlencoded', 'multipart/form-data',
    'text/plain', 'text/html', 'text/xml',
  ],
  'Accept': ['application/json', 'application/xml', 'text/plain', 'text/html', '*/*'],
  'Accept-Encoding': ['gzip, deflate, br', 'gzip, deflate', 'gzip'],
  'Accept-Language': ['en-US,en;q=0.9', 'en'],
  'Cache-Control': ['no-cache', 'no-store', 'max-age=0', 'must-revalidate'],
  'Connection': ['keep-alive', 'close'],
};

export function HeadersEditor({ headers, onChange, generatedHeaders, editorState, onEditorStateChange }: HeadersEditorProps) {
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
  }, [headers.length]);

  const setInputRef = (index: number, field: 'key' | 'value', el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(`${index}-${field}`, el);
    else inputRefs.current.delete(`${index}-${field}`);
  };

  const handleChange = (index: number, field: keyof HeaderEntry, value: string | boolean) => {
    const next = [...headers];
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
    const next = [...headers];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    onChange(next);
  };

  const handleDelete = (index: number) => {
    onChange(headers.filter((_, i) => i !== index));
  };

  const genCount = generatedHeaders?.length ?? 0;
  const hasGenerated = genCount > 0;

  // Keys set by the user (enabled) - used to mark generated entries as overridden
  const manualKeySet = new Set(
    headers.filter(r => r.enabled && r.key.trim()).map(r => r.key.toLowerCase())
  );

  // Add placeholder empty row at the end for new-entry UX
  const displayRows = [...headers, { key: '', value: '', description: '', enabled: true }];

  return (
    <div
      className="hdr-editor"
      style={{ fontFamily: 'inherit' }}
    >
      <style>{`
        .hdr-editor table { width: 100%; border-collapse: collapse; }

        /* Column header row */
        .hdr-editor thead tr th {
          text-align: left;
          font-size: 11px;
          font-weight: 500;
          color: var(--gray-9);
          padding: 4px 6px;
          border-bottom: 1px solid var(--gray-6);
          white-space: nowrap;
        }

        /* Data rows */
        .hdr-editor tbody tr.hdr-row,
        .hdr-editor tbody tr.gen-row {
          border-bottom: 1px solid var(--gray-5);
        }
        .hdr-editor tbody tr td { padding: 2px 6px; }

        /* Editable row states */
        .hdr-editor .hdr-row { transition: opacity 130ms ease; }
        .hdr-editor .hdr-row-empty { opacity: 0.38; }
        .hdr-editor .hdr-row-empty:hover { opacity: 0.6; }
        .hdr-editor .hdr-row-disabled { opacity: 0.4; }

        /* Checkbox */
        .hdr-editor .hdr-cb {
          width: 14px; height: 14px; border-radius: 3px;
          border: 1px solid var(--gray-7);
          background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .hdr-editor .hdr-cb[data-state="checked"] {
          background: var(--accent-9); border-color: var(--accent-9);
        }
        .hdr-editor .hdr-cb-ind { color: white; display: flex; align-items: center; }

        /* Delete button */
        .hdr-editor .hdr-del {
          color: var(--gray-8); background: none; border: none;
          cursor: pointer; padding: 2px; transition: color 100ms; line-height: 0;
        }
        .hdr-editor .hdr-del:hover { color: var(--red-9); }

        /* Generated rows */
        .hdr-editor .gen-row { background: var(--gray-2); }
        .hdr-editor .gen-row td { font-size: 12px; color: var(--gray-9); }
        .hdr-editor .gen-row-overridden { opacity: 0.45; }
        .hdr-editor .gen-badge {
          font-size: 10px; padding: 0 4px; border-radius: 3px; line-height: 16px;
          background: var(--amber-4); color: var(--amber-11); border: 1px solid var(--amber-6);
        }
        .hdr-editor .gen-src { font-size: 11px; color: var(--gray-8); font-style: italic; }

        /* Divider row between generated and editable sections */
        .hdr-editor .gen-divider td {
          padding: 0; height: 1px;
          background: var(--gray-7);
          border: none;
        }

        /* Generated toggle in the last th */
        .hdr-editor .gen-toggle-btn {
          display: inline-flex; align-items: center; gap: 4px;
          background: none; border: none; padding: 0;
          cursor: pointer; white-space: nowrap;
          font-size: 11px; font-weight: 500; color: var(--gray-9);
          transition: color 100ms;
        }
        .hdr-editor .gen-toggle-btn:hover { color: var(--gray-12); }
        .hdr-editor .gen-toggle-btn svg { width: 13px; height: 13px; flex-shrink: 0; }

        /* Readonly lock cell in generated rows */
        .hdr-editor .gen-lock { line-height: 0; opacity: 0.5; }
      `}</style>

      <table>
        <thead>
          <tr>
            {/* Checkbox / lock column */}
            <th style={{ width: 26 }} />
            <th style={{ width: '28%' }}>Key</th>
            <th style={{ width: '30%' }}>Value</th>
            <th>Description</th>
            {/* The last column header holds the generated-visibility toggle */}
            <th style={{ width: 26, textAlign: 'right' }}>
              {hasGenerated && (
                <button
                  type="button"
                  className="gen-toggle-btn"
                  title={generatedVisible ? 'Hide generated headers' : 'Show generated headers'}
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

          {/* --- Generated (auto) header rows at the TOP, when visible --- */}
          {hasGenerated && generatedVisible && (
            <>
              {generatedHeaders!.map((entry, i) => {
                const isOverridden = manualKeySet.has(entry.key.toLowerCase());
                return (
                  <tr
                    key={`gen-${i}`}
                    className={`gen-row${isOverridden ? ' gen-row-overridden' : ''}`}
                  >
                    {/* Lock icon instead of checkbox */}
                    <td className="gen-lock" style={{ textAlign: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="var(--gray-9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </td>
                    {/* Key - disabled input, same visual as editable rows */}
                    <td>
                      <TextField.Root
                        size="1"
                        value={entry.key}
                        disabled
                        readOnly
                        style={{ width: '100%' }}
                      />
                    </td>
                    {/* Value - disabled input, same visual as editable rows */}
                    <td>
                      <TextField.Root
                        size="1"
                        value={entry.value}
                        disabled
                        readOnly
                        style={{ width: '100%' }}
                      />
                    </td>
                    {/* Description / source / overridden badge */}
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="gen-src">{entry.source}</span>
                        {entry.description && <span className="gen-src">— {entry.description}</span>}
                        {isOverridden && <span className="gen-badge">overridden</span>}
                      </span>
                    </td>
                    {/* Empty actions column */}
                    <td />
                  </tr>
                );
              })}
              {/* Visual separator between generated and editable rows */}
              <tr className="gen-divider">
                <td colSpan={5} />
              </tr>
            </>
          )}

          {/* --- Editable user header rows --- */}
          {displayRows.map((row, index) => {
            const isEmptyRow = index === headers.length;
            const isActive = isEmptyRow && focusedRow === index;
            const isDisabled = !row.enabled && !isEmptyRow;

            const rowKey = isEmptyRow ? 'add-row' : `hdr-row-${index}`;
            const rowClass = [
              'hdr-row',
              isDisabled ? 'hdr-row-disabled' : '',
              isEmptyRow && !isActive ? 'hdr-row-empty' : '',
            ].filter(Boolean).join(' ');

            return (
              <tr key={rowKey} className={rowClass}>
                {/* Checkbox */}
                <td style={{ textAlign: 'center', width: 26 }}>
                  {!isEmptyRow && (
                    <Checkbox.Root
                      checked={row.enabled}
                      onCheckedChange={() => handleToggle(index)}
                      className="hdr-cb"
                    >
                      <Checkbox.Indicator className="hdr-cb-ind">
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
                    placeholder={isEmptyRow ? 'Header name' : ''}
                    disabled={isDisabled}
                    list={`hdr-klist-${index}`}
                    style={{ width: '100%' }}
                  />
                  <datalist id={`hdr-klist-${index}`}>
                    {COMMON_HEADERS.map(s => <option key={s} value={s} />)}
                  </datalist>
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
                    list={row.key && HEADER_VALUES[row.key] ? `hdr-vlist-${index}` : undefined}
                    style={{ width: '100%' }}
                  />
                  {row.key && HEADER_VALUES[row.key] && (
                    <datalist id={`hdr-vlist-${index}`}>
                      {HEADER_VALUES[row.key].map(s => <option key={s} value={s} />)}
                    </datalist>
                  )}
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
                      className="hdr-del"
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
