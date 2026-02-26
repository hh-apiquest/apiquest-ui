// EnvironmentsPanel - Environments list with full CRUD functionality
import { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../../contexts';
import type { Environment, Variable } from '@apiquest/types';
import type { EnvironmentMetadata } from '../../types/environment';
import { TextField } from '@radix-ui/themes';
import { VariableEditorDialog } from '../variables/VariableEditor';
import { InputDialog } from '../shared/InputDialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { UnifiedContextMenu, type MenuAction } from '../shared/UnifiedContextMenu';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  EllipsisVerticalIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';

export function EnvironmentsPanel() {
  const { 
    workspace, 
    activeEnvironment,
    setActiveEnvironment,
    createEnvironment, 
    renameEnvironment,
    deleteEnvironment,
    duplicateEnvironment,
    loadEnvironment,
    saveEnvironment
  } = useWorkspace();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewEnv, setShowNewEnv] = useState(false);
  const [editingEnv, setEditingEnv] = useState<EnvironmentMetadata | null>(null);
  const [envData, setEnvData] = useState<Environment | null>(null);
  const [renamingEnv, setRenamingEnv] = useState<EnvironmentMetadata | null>(null);
  const [duplicatingEnv, setDuplicatingEnv] = useState<EnvironmentMetadata | null>(null);
  const [deletingEnv, setDeletingEnv] = useState<EnvironmentMetadata | null>(null);
  const [activeRenameId, setActiveRenameId] = useState<string | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState('');
  const [rightClickMenuOpen, setRightClickMenuOpen] = useState(false);
  const [rightClickPosition, setRightClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [rightClickEnv, setRightClickEnv] = useState<EnvironmentMetadata | null>(null);

  if (!workspace) return null;

  const filteredEnvironments = workspace.environments.filter(env => 
    !searchQuery || env.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePanelClick = (e: React.MouseEvent) => {
    // Submit active rename when clicking on empty space
    if (activeRenameId && e.target === e.currentTarget) {
      setActiveRenameId(null);
      setInlineRenameValue('');
    }
  };

  const handleEnvClick = async (env: EnvironmentMetadata) => {
    try {
      const data = await loadEnvironment(env.fileName);
      if (!data.variables) {
        data.variables = {};
      }
      setEnvData(data);
      setEditingEnv(env);
    } catch (error) {
      console.error('Failed to load environment:', error);
      alert('Failed to load environment');
    }
  };

  const handleSaveEnvVars = async (updatedVariables: Record<string, string | Variable>) => {
    if (!editingEnv || !envData) return;
    
    try {
      const updatedEnv = { ...envData, variables: updatedVariables };
      await saveEnvironment(editingEnv.fileName, updatedEnv);
      setEditingEnv(null);
      setEnvData(null);
    } catch (error) {
      console.error('Failed to save environment:', error);
      alert('Failed to save environment');
    }
  };

  const handleCreateEnvironment = async (name: string) => {
    try {
      await createEnvironment(name);
    } catch (error) {
      console.error('Failed to create environment:', error);
      alert('Failed to create environment');
    }
  };

  const handleRenameEnvironment = async (newName: string) => {
    if (!renamingEnv) return;
    
    try {
      await renameEnvironment(renamingEnv, newName);
      setRenamingEnv(null);
    } catch (error) {
      console.error('Failed to rename environment:', error);
      alert('Failed to rename environment');
    }
  };

  const handleDuplicateEnvironment = async (newName: string) => {
    if (!duplicatingEnv) return;
    
    try {
      await duplicateEnvironment(duplicatingEnv, newName);
      setDuplicatingEnv(null);
    } catch (error) {
      console.error('Failed to duplicate environment:', error);
      alert('Failed to duplicate environment');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEnv) return;
    
    try {
      await deleteEnvironment(deletingEnv);
      setDeletingEnv(null);
    } catch (error) {
      console.error('Failed to delete environment:', error);
      alert('Failed to delete environment');
    }
  };

  const handleSetActive = (env: EnvironmentMetadata) => {
    setActiveEnvironment(activeEnvironment?.id === env.id ? null : env);
  };

  const handleStartInlineRename = (env: EnvironmentMetadata) => {
    // Cancel any existing rename before starting a new one
    setActiveRenameId(env.id);
    setInlineRenameValue(env.name);
  };

  const handleInlineRenameSubmit = async (env: EnvironmentMetadata) => {
    if (inlineRenameValue.trim() && inlineRenameValue !== env.name) {
      try {
        await renameEnvironment(env, inlineRenameValue.trim());
      } catch (error) {
        console.error('Failed to rename environment:', error);
        alert('Failed to rename environment');
      }
    }
    setActiveRenameId(null);
    setInlineRenameValue('');
  };

  const handleInlineRenameCancel = () => {
    setActiveRenameId(null);
    setInlineRenameValue('');
  };

  const handleMenuAction = async (action: MenuAction, env: EnvironmentMetadata) => {
    switch (action) {
      case 'edit-variables':
        handleEnvClick(env);
        break;
      case 'set-active':
        handleSetActive(env);
        break;
      case 'rename':
        handleStartInlineRename(env);
        break;
      case 'duplicate':
        setDuplicatingEnv(env);
        break;
      case 'delete':
        setDeletingEnv(env);
        break;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search and Action Buttons */}
      <div className="flex gap-1 border-b">
        <TextField.Root
          size="1"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <button
          onClick={() => setShowNewEnv(true)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer"
          style={{ border: 'none', background: 'var(--accent-9)', color: 'white' }}
          title="New Environment"
        >
          <PlusIcon className="w-3 h-3" />
        </button>
      </div>

      {/* Environments List */}
      <div className="flex-1 overflow-auto p-2" onClick={handlePanelClick}>
        {filteredEnvironments.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center" style={{ height: '128px' }}>
            <div className="text-xs mb-2" style={{ color: 'var(--gray-9)' }}>
              {searchQuery ? 'No environments match' : 'No environments'}
            </div>
            {!searchQuery && (
              <div className="text-xxs" style={{ color: 'var(--gray-9)' }}>Click + to create one</div>
            )}
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: '2px' }}>
            {filteredEnvironments.map((env) => (
              <EnvironmentItem
                key={env.id}
                env={env}
                activeRenameId={activeRenameId}
                inlineRenameValue={inlineRenameValue}
                setInlineRenameValue={setInlineRenameValue}
                activeEnvironment={activeEnvironment}
                handleEnvClick={handleEnvClick}
                handleStartInlineRename={handleStartInlineRename}
                handleInlineRenameSubmit={handleInlineRenameSubmit}
                handleInlineRenameCancel={handleInlineRenameCancel}
                setRightClickPosition={setRightClickPosition}
                setRightClickEnv={setRightClickEnv}
                setRightClickMenuOpen={setRightClickMenuOpen}
                handleMenuAction={handleMenuAction}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Environment Dialog */}
      <InputDialog
        open={showNewEnv}
        onOpenChange={setShowNewEnv}
        title="New Environment"
        placeholder="Environment name (e.g., Development, Production)"
        onSubmit={handleCreateEnvironment}
      />

      {/* Rename Environment Dialog */}
      <InputDialog
        open={!!renamingEnv}
        onOpenChange={(open) => !open && setRenamingEnv(null)}
        title="Rename Environment"
        placeholder="New environment name"
        defaultValue={renamingEnv?.name}
        onSubmit={handleRenameEnvironment}
      />

      {/* Duplicate Environment Dialog */}
      <InputDialog
        open={!!duplicatingEnv}
        onOpenChange={(open) => !open && setDuplicatingEnv(null)}
        title="Duplicate Environment"
        placeholder="New environment name"
        defaultValue={duplicatingEnv ? `${duplicatingEnv.name} Copy` : ''}
        onSubmit={handleDuplicateEnvironment}
      />

      {/* Environment Variables Editor Dialog */}
      {editingEnv && envData && (
        <VariableEditorDialog
          open={!!editingEnv}
          onOpenChange={(open) => {
            if (!open) {
              setEditingEnv(null);
              setEnvData(null);
            }
          }}
          title={`${editingEnv.name} Variables`}
          variables={envData.variables}
          onSave={handleSaveEnvVars}
          showEnabled={true}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingEnv}
        onOpenChange={(open) => !open && setDeletingEnv(null)}
        title="Delete Environment"
        description={`Are you sure you want to delete "${deletingEnv?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
      />

      {/* Right-click Context Menu */}
      {rightClickPosition && rightClickEnv && (
        <UnifiedContextMenu
          type="environment"
          item={rightClickEnv}
          open={rightClickMenuOpen}
          onOpenChange={setRightClickMenuOpen}
          position={rightClickPosition}
          additionalInfo={{ isActive: activeEnvironment?.id === rightClickEnv.id }}
          onAction={(action) => handleMenuAction(action, rightClickEnv)}
        />
      )}
    </div>
  );
}

function EnvironmentItem({
  env,
  activeRenameId,
  inlineRenameValue,
  setInlineRenameValue,
  activeEnvironment,
  handleEnvClick,
  handleStartInlineRename,
  handleInlineRenameSubmit,
  handleInlineRenameCancel,
  setRightClickPosition,
  setRightClickEnv,
  setRightClickMenuOpen,
  handleMenuAction
}: {
  env: EnvironmentMetadata;
  activeRenameId: string | null;
  inlineRenameValue: string;
  setInlineRenameValue: (value: string) => void;
  activeEnvironment: EnvironmentMetadata | null;
  handleEnvClick: (env: EnvironmentMetadata) => void;
  handleStartInlineRename: (env: EnvironmentMetadata) => void;
  handleInlineRenameSubmit: (env: EnvironmentMetadata) => void;
  handleInlineRenameCancel: () => void;
  setRightClickPosition: (pos: { x: number; y: number } | null) => void;
  setRightClickEnv: (env: EnvironmentMetadata | null) => void;
  setRightClickMenuOpen: (open: boolean) => void;
  handleMenuAction: (action: MenuAction, env: EnvironmentMetadata) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusTimeRef = useRef<number>(0);

  // Explicitly focus input when rename becomes active
  useEffect(() => {
    if (activeRenameId === env.id && inputRef.current) {
      console.log('[Environment] Starting rename for:', env.id);
      // Use setTimeout to ensure input is fully mounted in DOM
      setTimeout(() => {
        if (inputRef.current) {
          focusTimeRef.current = Date.now();
          inputRef.current.focus();
          inputRef.current.select();
          console.log('[Environment] Input focused at:', focusTimeRef.current);
        }
      }, 0);
    }
  }, [activeRenameId, env.id]);

  const handleBlur = () => {
    const timeSinceFocus = Date.now() - focusTimeRef.current;
    console.log('[Environment] Blur fired, time since focus:', timeSinceFocus + 'ms');
    
    // Ignore blur events that happen too quickly after focus (menu closing)
    if (timeSinceFocus < 100) {
      console.log('[Environment] Ignoring premature blur, refocusing input');
      // Refocus the input since focus was stolen
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
      return;
    }
    
    console.log('[Environment] Submitting rename');
    handleInlineRenameSubmit(env);
  };

  return (
    <div>
      <style>{`
        .env-item:hover { background: var(--gray-3); }
        .env-item .hover-visible { opacity: 0; }
        .env-item:hover .hover-visible { opacity: 1; }
      `}</style>
      <div 
        className="env-item flex items-center gap-2 px-2 py-1 text-xs rounded"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRightClickPosition({ x: e.clientX, y: e.clientY });
          setRightClickEnv(env);
          setRightClickMenuOpen(true);
        }}
      >
        <GlobeAltIcon className="w-4 h-4" style={{ color: 'var(--accent-9)', flexShrink: 0 }} />
        
        {activeRenameId === env.id ? (
          <TextField.Root
            ref={inputRef}
            size="1"
            value={inlineRenameValue}
            onChange={(e) => setInlineRenameValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleInlineRenameSubmit(env);
              } else if (e.key === 'Escape') {
                handleInlineRenameCancel();
              }
            }}
            style={{ flex: 1 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span 
            className="flex-1 truncate cursor-pointer"
            onClick={() => handleEnvClick(env)}
            title={env.name}
          >
            {env.name}
          </span>
        )}
        
        {/* Active indicator */}
        {activeEnvironment?.id === env.id && activeRenameId !== env.id && (
          <span className="text-xxs font-semibold" style={{ color: '#22c55e' }}>●</span>
        )}
        
        {/* Three-dots menu */}
        <UnifiedContextMenu
          type="environment"
          item={env}
          trigger={
            <button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-10)' }}>
              <EllipsisVerticalIcon className="w-4 h-4" />
            </button>
          }
          additionalInfo={{ isActive: activeEnvironment?.id === env.id }}
          onAction={(action) => handleMenuAction(action, env)}
        />
      </div>
    </div>
  );
}
