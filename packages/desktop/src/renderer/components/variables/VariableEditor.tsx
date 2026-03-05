// VariableEditor - Reusable key/value/vault editor for environments, collections, and globals
import { useState, useMemo, useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { Variable, VariablePrimitive, VariableValue } from '@apiquest/types';
import { pluginManagerService } from '../../services';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { TextField } from '@radix-ui/themes';
import { TrashIcon, EllipsisVerticalIcon, EllipsisHorizontalIcon, Bars3Icon, KeyIcon } from '@heroicons/react/24/outline';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Internal type for UI editing - adds key property to Variable
type VariableRow = { key: string } & Variable;

type AppRegionStyle = CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag';
};

function getThemePortalContainer(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  return (document.querySelector('.radix-themes') as HTMLElement | null) ?? document.body;
}

function coerceValueToType(value: VariablePrimitive, type: Variable['type'] | undefined): VariablePrimitive {
  if (type === 'null') return null;
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    if (typeof value === 'number') return value !== 0;
    return false;
  }
  if (type === 'number') {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === null || value === '') return 0;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  // default string
  return value === null ? '' : String(value);
}

interface VariableEditorProps {
  title: string;
  rows: VariableRow[];
  onRowsChange: (rows: VariableRow[]) => void;
  showEnabled?: boolean;
}

export function VariableEditor({ 
  title, 
  rows,
  onRowsChange,
  showEnabled = true,
}: VariableEditorProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const vaultPlugins = pluginManagerService.getAllVaultPlugins();

  // Radix Themes CSS variables live on the `.radix-themes` root element.
  // These Radix primitive portals default to `document.body`, which can cause
  // missing/transparent styling if the theme variables are not available.
  const portalContainer = getThemePortalContainer();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addVariable = () => {
    const newRows = [...rows, { 
      key: '', 
      value: '',
      type: 'string',
      enabled: true 
    } as VariableRow];
    onRowsChange(newRows);
    setEditingId(rows.length);
  };

  const updateVariable = (index: number, updates: Partial<VariableRow>) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], ...updates };
    onRowsChange(newRows);
  };

  const deleteVariable = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index);
    onRowsChange(newRows);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = Number(active.id);
      const newIndex = Number(over.id);
      const newRows = arrayMove(rows, oldIndex, newIndex);
      onRowsChange(newRows);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <style>{`
        .ve-row:hover { background: var(--gray-2); }
        .ve-drag-handle:hover { color: var(--gray-11); }

        .ve-checkbox {
          width: 14px; height: 14px; border-radius: 3px;
          border: 1px solid var(--gray-7);
          background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .ve-checkbox[data-state="checked"] {
          background: var(--accent-9);
          border-color: var(--accent-9);
        }
        .ve-checkbox-ind { color: white; display: flex; align-items: center; }

        .ve-select-item[data-highlighted],
        .ve-menu-item[data-highlighted] {
          background: var(--gray-3);
          outline: none;
        }

        .ve-menu-item[data-disabled] { opacity: 0.6; }

        /* Compact bordered TextField styling to match editor tables */
        .ve-row .rt-TextFieldRoot {
          width: 100% !important;
          border: 1px solid var(--gray-6) !important;
          box-shadow: none !important;
          background: var(--color-background) !important;
          border-radius: 6px !important;
          padding: 0 !important;
        }

        .ve-row .rt-TextFieldInput {
          background: transparent !important;
          padding: 3px 6px !important;
          font-size: 12px !important;
        }

        .ve-row .rt-TextFieldInput:focus {
          outline: none !important;
        }
      `}</style>

      <div className="flex items-center justify-between p-3 border-b">
        <h2 className="font-semibold" style={{ fontSize: '13px', color: 'var(--gray-12)' }}>{title}</h2>
        <button
          onClick={addVariable}
          className="px-2 py-0.5 text-xs rounded cursor-pointer"
          style={{
            background: 'var(--accent-9)',
            color: 'white',
            border: '1px solid var(--accent-9)'
          }}
        >
          + Add Variable
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead className="text-xs" style={{ position: 'sticky', top: 0, background: 'var(--gray-2)', color: 'var(--gray-12)', zIndex: 1, borderBottom: '1px solid var(--gray-6)' }}>
              <tr>
                <th className="text-center font-semibold p-1" style={{ width: '28px' }}></th>
                {showEnabled && <th className="text-center font-semibold p-1" style={{ width: '36px' }}>On</th>}
                <th className="text-left font-semibold p-1">Variable</th>
                <th className="text-left font-semibold p-1">Value</th>
                <th className="text-center font-semibold p-1" style={{ width: '36px' }}></th>
              </tr>
            </thead>
            <SortableContext items={rows.map((_, i) => i)} strategy={verticalListSortingStrategy}>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={showEnabled ? 5 : 4} className="text-center" style={{ padding: '24px 8px', color: 'var(--gray-9)' }}>
                      No variables defined. Click "+ Add Variable" to create one.
                    </td>
                  </tr>
                ) : (
                  rows.map((variable, index) => (
                    <SortableVariableRow
                      key={index}
                      id={index}
                      variable={variable}
                      index={index}
                      isEditing={editingId === index}
                      vaultPlugins={vaultPlugins}
                      showEnabled={showEnabled}
                      onUpdate={(updates) => updateVariable(index, updates)}
                      onDelete={() => deleteVariable(index)}
                      onEdit={() => setEditingId(index)}
                      onStopEdit={() => setEditingId(null)}
                    />
                  ))
                )}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>
    </div>
  );
}

interface SortableVariableRowProps {
  id: number;
  variable: VariableRow;
  index: number;
  isEditing: boolean;
  vaultPlugins: any[];
  showEnabled: boolean;
  onUpdate: (updates: Partial<VariableRow>) => void;
  onDelete: () => void;
  onEdit: () => void;
  onStopEdit: () => void;
}

function SortableVariableRow(props: SortableVariableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="ve-row border-b"
    >
      {/* Drag Handle */}
      <td className="p-2 text-center border-r">
        <button
          {...attributes}
          {...listeners}
          className="ve-drag-handle p-1 rounded-md bg-transparent border-none"
          style={{
            color: 'var(--gray-9)',
            cursor: 'grab'
          }}
          title="Drag to reorder"
        >
          <Bars3Icon className="w-4 h-4" />
        </button>
      </td>
      <VariableRowContent {...props} />
    </tr>
  );
}

interface VariableRowProps {
  variable: VariableRow;
  index: number;
  isEditing: boolean;
  vaultPlugins: any[];
  showEnabled: boolean;
  onUpdate: (updates: Partial<VariableRow>) => void;
  onDelete: () => void;
  onEdit: () => void;
  onStopEdit: () => void;
}

function VariableRowContent({
  variable, 
  isEditing,
  vaultPlugins,
  showEnabled,
  onUpdate, 
  onDelete,
  onEdit,
  onStopEdit
}: VariableRowProps) {
  const portalContainer = getThemePortalContainer();

  // Get available providers: default + vault plugins
  const providers = [
    { value: undefined, label: 'None' },
    { value: 'env', label: 'Environment Variable' },
    ...vaultPlugins.map((plugin: any) => ({
      value: `vault:${plugin.name}`,
      label: `${plugin.icon} ${plugin.name}`
    }))
  ];

  const setType = (nextType: Variable['type']) => {
    onUpdate({
      type: nextType,
      value: coerceValueToType(variable.value, nextType),
    });
  };

  return (
    <>
      {/* Enabled */}
      {showEnabled && (
        <td className="px-2 py-1 text-center border-r">
          <div className="inline-flex items-center justify-center">
            <Checkbox.Root
              checked={variable.enabled !== false}
              onCheckedChange={(checked) => onUpdate({ enabled: checked === true })}
              className="ve-checkbox"
              style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}
              title={variable.enabled === false ? 'Enable variable' : 'Disable variable'}
            >
              <Checkbox.Indicator className="ve-checkbox-ind">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M10 3L4.5 8.5L2 6"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Checkbox.Indicator>
            </Checkbox.Root>
          </div>
        </td>
      )}

      {/* Key with Secret Toggle */}
      <td className="px-2 py-1 border-r">
        <div className="relative flex items-center w-full">
          <TextField.Root
            size="1"
            value={variable.key}
            onChange={(e) => onUpdate({ key: e.target.value })}
            onFocus={onEdit}
            onBlur={onStopEdit}
            style={{ paddingRight: '44px', width: '100%' }}
          />
          <div className="absolute right-0 inline-flex items-center" style={{ gap: '2px' }}>
            <button
              onClick={() => onUpdate({ isSecret: !variable.isSecret })}
              className="bg-transparent border-none cursor-pointer"
              style={{
                paddingLeft: '4px',
                paddingRight: '0px',
                color: variable.isSecret ? 'var(--accent-9)' : 'var(--gray-8)',
                WebkitAppRegion: 'no-drag'
              } as AppRegionStyle}
              title={variable.isSecret ? 'Secret variable (click to unset)' : 'Mark as secret'}
            >
              <KeyIcon className="w-3.5 h-3.5" />
            </button>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="bg-transparent border-none cursor-pointer"
                  style={{
                    paddingLeft: '4px',
                    paddingRight: '0px',
                    color: 'var(--gray-9)',
                    WebkitAppRegion: 'no-drag'
                  } as AppRegionStyle}
                  title="Variable options"
                >
                  <EllipsisHorizontalIcon className="w-3.5 h-3.5" />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal container={portalContainer}>
                <DropdownMenu.Content
                  style={{
                    background: 'var(--color-background)',
                    border: '1px solid var(--gray-6)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                    overflow: 'hidden',
                    zIndex: 50,
                    minWidth: '180px',
                    color: 'var(--gray-12)',
                    WebkitAppRegion: 'no-drag'
                  } as AppRegionStyle}
                  sideOffset={4}
                >
                  <DropdownMenu.Label className="px-2 py-1 text-xs font-semibold text-left" style={{ color: 'var(--gray-9)' }}>
                    Type
                  </DropdownMenu.Label>
                  {(['string', 'number', 'boolean', 'null'] as const).map((t) => (
                    <DropdownMenu.Item
                      key={t}
                      className="ve-menu-item flex items-center justify-between px-2 py-1 text-xs cursor-pointer"
                      style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}
                      onClick={() => setType(t)}
                    >
                      <span style={{ textTransform: 'capitalize' }}>{t}</span>
                      {(variable.type ?? 'string') === t && (
                        <CheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent-9)' }} />
                      )}
                    </DropdownMenu.Item>
                  ))}

                  <DropdownMenu.Separator style={{ height: '1px', background: 'var(--gray-6)' }} />
                  <DropdownMenu.Label className="px-2 py-1 text-xs font-semibold text-left" style={{ color: 'var(--gray-9)' }}>
                    Provider
                  </DropdownMenu.Label>
                  {providers.map((provider) => (
                    <DropdownMenu.Item
                      key={provider.value || 'none'}
                      className="ve-menu-item flex items-center justify-between px-2 py-1 text-xs cursor-pointer"
                      style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}
                      onClick={() => onUpdate({ provider: provider.value })}
                    >
                      <span>{provider.label}</span>
                      {variable.provider === provider.value && (
                        <CheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent-9)' }} />
                      )}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </td>

      {/* Value */}
      <td className="px-2 py-1 border-r">
        {variable.type === 'boolean' ? (
          <Select.Root
            value={String(coerceValueToType(variable.value, 'boolean'))}
            onValueChange={(value) => onUpdate({ value: value === 'true' })}
          >
            <Select.Trigger
              className="inline-flex items-center justify-between w-full rounded-md text-xs cursor-pointer"
              style={{
                padding: '2px 6px',
                background: 'transparent',
                border: '1px solid transparent',
                color: 'var(--gray-12)',
                WebkitAppRegion: 'no-drag'
              } as AppRegionStyle}
            >
              <Select.Value />
              <Select.Icon style={{ marginLeft: '6px', color: 'var(--gray-9)' }}>
                <ChevronDownIcon className="w-4 h-4" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal container={portalContainer}>
              <Select.Content
                style={{
                  background: 'var(--color-background)',
                  border: '1px solid var(--gray-6)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                  overflow: 'hidden',
                  zIndex: 50,
                  color: 'var(--gray-12)',
                  WebkitAppRegion: 'no-drag'
                } as AppRegionStyle}
                position="popper"
                sideOffset={4}
              >
                <Select.Viewport style={{ padding: '4px' }}>
                  <Select.Item value="true" className="ve-select-item" style={{ padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' }}>
                    <Select.ItemText>true</Select.ItemText>
                  </Select.Item>
                  <Select.Item value="false" className="ve-select-item" style={{ padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' }}>
                    <Select.ItemText>false</Select.ItemText>
                  </Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        ) : variable.type === 'null' ? (
          <TextField.Root
            size="1"
            value="null"
            readOnly
            onFocus={onEdit}
            onBlur={onStopEdit}
            style={{ width: '100%' }}
          />
        ) : (
          <TextField.Root
            size="1"
            type={variable.isSecret ? 'password' : variable.type === 'number' ? 'number' : 'text'}
            value={
              variable.type === 'number'
                ? (typeof variable.value === 'number' ? variable.value : Number(coerceValueToType(variable.value, 'number')))
                : String(coerceValueToType(variable.value, 'string'))
            }
            onChange={(e) => {
              if (variable.type === 'number') {
                const raw = e.target.value;
                onUpdate({ value: raw === '' ? 0 : Number(raw) });
                return;
              }
              onUpdate({ value: e.target.value });
            }}
            onFocus={onEdit}
            onBlur={onStopEdit}
            style={{ width: '100%' }}
          />
        )}
      </td>

      {/* Delete */}
      <td className="p-1 text-center">
        <button
          onClick={onDelete}
          className="p-1 rounded-md bg-transparent border-none cursor-pointer"
          style={{ color: 'var(--gray-9)' }}
          title="Delete variable"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </td>
    </>
  );
}

// Dialog wrapper for variable editor
interface VariableEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  variables: Record<string, VariableValue>;
  onSave: (variables: Record<string, VariableValue>) => void;
  showEnabled?: boolean;
}

export function VariableEditorDialog({
  open,
  onOpenChange,
  title,
  variables,
  onSave,
  showEnabled
}: VariableEditorDialogProps) {
  const portalContainer = getThemePortalContainer();

  // Internal state: maintain rows while editing (NOT synced to parent until Save)
  const [rows, setRows] = useState<VariableRow[]>([]);

  // Initialize rows when dialog opens
  useEffect(() => {
    if (open) {
      const initialRows = Object.entries(variables).map(([key, val]) => {
        const variable: Variable = (typeof val === 'object' && val !== null && 'value' in val)
          ? (val as Variable)
          : { value: val as VariablePrimitive };
        return { ...variable, key };
      });
      setRows(initialRows);
    }
  }, [open, variables]);

  // Validate for duplicates (not empty keys - we allow those during editing)
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const nonEmptyKeys = rows.filter(r => r.key.trim() !== '').map(r => r.key);
    const uniqueKeys = new Set(nonEmptyKeys);
    
    if (nonEmptyKeys.length !== uniqueKeys.size) {
      const duplicates = nonEmptyKeys.filter((key, index) => nonEmptyKeys.indexOf(key) !== index);
      errors.push(`Duplicate variable names: ${[...new Set(duplicates)].join(', ')}`);
    }
    
    return errors;
  }, [rows]);

  const isValid = validationErrors.length === 0;

  const handleSave = () => {
    if (!isValid) return;
    
    // Filter empty keys and convert to Record format
    const record: Record<string, VariableValue> = {};
    for (const row of rows) {
      const { key, ...varData } = row;
      if (key.trim()) {  // Only include non-empty keys
        // If only value exists, store primitive; otherwise as Variable object
        if (Object.keys(varData).length === 1 && varData.value !== undefined) {
          record[key] = varData.value;
        } else {
          record[key] = varData as Variable;
        }
      }
    }
    
    onSave(record);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 50
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-background)',
            border: '1px solid var(--gray-6)',
            borderRadius: '10px',
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
            width: '800px',
            height: '600px',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
          aria-describedby={undefined}
        >
          <Dialog.Title style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>{title}</Dialog.Title>
          <VariableEditor
            title={title}
            rows={rows}
            onRowsChange={setRows}
            showEnabled={showEnabled}
          />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderTop: '1px solid var(--gray-6)' }}>
            {validationErrors.length > 0 && (
              <div style={{ fontSize: '12px', color: 'var(--red-10)' }}>
                {validationErrors.map((error, i) => (
                  <div key={i}>{error}</div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Dialog.Close
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: 'var(--gray-12)',
                  background: 'var(--gray-3)',
                  border: '1px solid var(--gray-6)',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </Dialog.Close>
              <button
                onClick={handleSave}
                disabled={!isValid}
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: isValid ? 'var(--accent-9)' : 'var(--gray-7)',
                  background: isValid ? 'var(--accent-9)' : 'var(--gray-4)',
                  color: isValid ? 'white' : 'var(--gray-9)',
                  cursor: isValid ? 'pointer' : 'not-allowed'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
