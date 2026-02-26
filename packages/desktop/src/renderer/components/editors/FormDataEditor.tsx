// FormDataEditor - Multipart form data editor
// For file uploads and form submissions

import React from 'react';
import { TextField } from '@radix-ui/themes';
import { XMarkIcon } from '@heroicons/react/24/outline';

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

export function FormDataEditor({ formData, onChange }: FormDataEditorProps) {
  // Always have one empty row at the end
  const rows = [...formData, { key: '', value: '', type: 'text' as const, disabled: false }];

  const handleChange = (
    index: number,
    field: 'key' | 'value' | 'type' | 'disabled',
    newValue: string | boolean
  ) => {
    const newData = [...formData];
    
    if (index === formData.length) {
      // Adding new row
      if (field === 'key' || field === 'value') {
        newData.push({ key: '', value: '', type: 'text', disabled: false, [field]: newValue });
      }
    } else {
      // Updating existing row
      newData[index] = { ...newData[index], [field]: newValue };
      
      // Remove row if both key and value are empty
      if (newData[index].key === '' && newData[index].value === '') {
        newData.splice(index, 1);
      }
    }
    
    onChange(newData);
  };

  const handleDelete = (index: number) => {
    const newData = formData.filter((_, i) => i !== index);
    onChange(newData);
  };

  return (
    <div className="form-data-editor">
      <style>{`
        .form-data-row {
          border-bottom: 1px solid var(--gray-6);
        }
        .form-data-row-disabled {
          opacity: 0.5;
        }
        .form-data-input {
          border: 1px solid var(--gray-6);
          color: var(--gray-12);
          background: transparent;
        }
        .form-data-input:focus {
          outline: 2px solid var(--accent-8);
          outline-offset: 1px;
        }
        .form-data-select {
          border: 1px solid var(--gray-6);
          color: var(--gray-12);
          background: var(--color-background);
        }
        .form-data-select:focus {
          outline: 2px solid var(--accent-8);
          outline-offset: 1px;
        }
        .form-data-checkbox {
          border: 1px solid var(--gray-6);
        }
        .form-data-delete {
          color: var(--gray-9);
        }
        .form-data-delete:hover {
          color: var(--red-9);
        }
      `}</style>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="w-10 px-2 py-2"></th>
            <th className="px-2 py-2 text-left text-xs font-medium" style={{ color: 'var(--gray-9)' }}>
              Key
            </th>
            <th className="px-2 py-2 text-left text-xs font-medium" style={{ color: 'var(--gray-9)' }}>
              Value
            </th>
            <th className="w-24 px-2 py-2 text-left text-xs font-medium" style={{ color: 'var(--gray-9)' }}>
              Type
            </th>
            <th className="w-10 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isLastRow = index === formData.length;
            return (
              <tr
                key={index}
                className={`form-data-row ${row.disabled && !isLastRow ? 'form-data-row-disabled' : ''}`}
              >
                <td className="px-2 py-1">
                  {!isLastRow && (
                    <input
                      type="checkbox"
                      checked={!row.disabled}
                      onChange={(e) => handleChange(index, 'disabled', !e.target.checked)}
                      className="form-data-checkbox rounded"
                    />
                  )}
                </td>
                <td className="px-2 py-1">
                  <TextField.Root
                    size="1"
                    value={row.key}
                    onChange={(e) => handleChange(index, 'key', e.target.value)}
                    placeholder={isLastRow ? 'Key' : ''}
                    className="w-full"
                  />
                </td>
                <td className="px-2 py-1">
                  <TextField.Root
                    size="1"
                    value={row.value}
                    onChange={(e) => handleChange(index, 'value', e.target.value)}
                    placeholder={row.type === 'binary' ? 'File path' : (isLastRow ? 'Value' : '')}
                    className="w-full"
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    value={row.type}
                    onChange={(e) => handleChange(index, 'type', e.target.value)}
                    className="form-data-select w-full px-2 py-1 text-sm rounded"
                    disabled={isLastRow}
                  >
                    <option value="text">Text</option>
                    <option value="binary">File</option>
                  </select>
                </td>
                <td className="px-2 py-1 text-center">
                  {!isLastRow && (
                    <button
                      onClick={() => handleDelete(index)}
                      className="form-data-delete inline-flex items-center justify-center"
                      title="Delete"
                      type="button"
                    >
                      <XMarkIcon className="w-4 h-4" />
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
