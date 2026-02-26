// WorkspaceManager - Full-screen workspace management UI
import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeftIcon,
  PlusIcon,
  FolderPlusIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';
import { useScreenMode, useWorkspace } from '../../contexts';
import type { WorkspaceWithMetadata } from '../../types/quest';

export function WorkspaceManager() {
  const { setMode } = useScreenMode();
  const { openWorkspace } = useWorkspace();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<{ path: string; name: string; description?: string } | null>(null);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    setIsLoading(true);
    try {
      const result = await window.quest.workspace.listWithMetadata();
      setWorkspaces(result);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenWorkspace = async (workspacePath: string) => {
    try {
      await openWorkspace(workspacePath);
      setMode('request-editor'); // Switch back to main view
    } catch (error) {
      console.error('Failed to open workspace:', error);
      alert('Failed to open workspace');
    }
  };

  const handleEditWorkspace = (ws: WorkspaceWithMetadata) => {
    setEditingWorkspace({
      path: ws.path,
      name: ws.metadata?.name || '',
      description: ws.metadata?.description
    });
  };

  const filteredWorkspaces = workspaces.filter((ws) => {
    const name = ws.metadata?.name || ws.path.split(/[\\/]/).pop() || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="wm-page flex flex-col h-full">
      <style>{`
        .wm-page {
          background: var(--color-background);
        }
        .wm-border {
          border-color: var(--gray-6);
        }
        .wm-muted {
          color: var(--gray-9);
        }
        .wm-subtle {
          color: var(--gray-10);
        }
        .wm-title {
          color: var(--gray-12);
        }
        .wm-card {
          border: 1px solid var(--gray-6);
          background: var(--color-background);
        }
        .wm-card:hover {
          border-color: var(--accent-9);
        }
        .wm-grid {
          display: grid;
          grid-template-columns: repeat(1, minmax(0, 1fr));
          gap: var(--space-4);
        }
        @media (min-width: 768px) {
          .wm-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (min-width: 1024px) {
          .wm-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        .wm-button {
          border-radius: 6px;
          border: 1px solid transparent;
        }
        .wm-button-outline {
          border-color: var(--gray-6);
          color: var(--gray-10);
          background: transparent;
        }
        .wm-button-outline:hover {
          background: var(--gray-2);
          color: var(--gray-12);
        }
        .wm-button-primary {
          background: var(--accent-9);
          color: white;
        }
        .wm-button-primary:hover {
          background: var(--accent-10);
        }
        .wm-button-secondary {
          background: var(--gray-3);
          color: var(--gray-12);
        }
        .wm-button-secondary:hover {
          background: var(--gray-4);
        }
        .wm-button-muted {
          background: var(--gray-3);
          color: var(--gray-12);
        }
        .wm-button-muted:hover {
          background: var(--gray-4);
        }
        .wm-icon-button {
          color: var(--gray-9);
        }
        .wm-icon-button:hover {
          color: var(--gray-11);
        }
        .wm-input {
          border: 1px solid var(--gray-6);
          background: var(--color-background);
          color: var(--gray-12);
        }
        .wm-input::placeholder {
          color: var(--gray-8);
        }
        .wm-input:focus {
          outline: 2px solid var(--accent-8);
          outline-offset: 1px;
        }
        .wm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 50;
        }
        .wm-dialog {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--color-background);
          border: 1px solid var(--gray-6);
          border-radius: 10px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
          z-index: 50;
        }
      `}</style>
      {/* Header */}
      <div className="px-6 py-4 border-b wm-border flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold wm-title">Workspace Manager</h1>
          <p className="text-sm wm-muted mt-1">
            Manage your ApiQuest workspaces
          </p>
        </div>
        <button
          onClick={() => setMode('request-editor')}
          className="wm-button wm-button-outline px-3 py-1 text-sm inline-flex items-center gap-2 transition-colors"
          type="button"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* Actions Bar */}
      <div className="px-4 py-3 border-b wm-border" style={{ background: 'var(--gray-2)' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="wm-button wm-button-primary px-3 py-1 text-xs font-medium inline-flex items-center gap-1 transition-colors"
            type="button"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Create Workspace
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="wm-button wm-button-secondary px-3 py-1 text-xs font-medium inline-flex items-center gap-1 transition-colors"
            type="button"
          >
            <FolderPlusIcon className="w-3.5 h-3.5" />
            Add Existing
          </button>
          <div className="flex-1"></div>
          <input
            type="text"
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="wm-input w-64 px-2 py-1 text-xs rounded"
          />
        </div>
      </div>

      {/* Workspace List */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center" style={{ height: '256px' }}>
            <div className="wm-muted">Loading workspaces...</div>
          </div>
        ) : filteredWorkspaces.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: '256px' }}>
            <div className="text-center">
              <div className="wm-muted">No workspaces found</div>
              {searchQuery && (
                <div className="text-sm wm-subtle mt-1">
                  Try a different search term
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="wm-grid">
            {filteredWorkspaces.map((ws) => {
              const name = ws.metadata?.name || ws.path.split(/[\\/]/).pop() || 'Unnamed';
              const createdAt = ws.metadata?.createdAt
                ? new Date(ws.metadata.createdAt).toLocaleDateString()
                : 'Unknown';

              return (
                <div
                  key={ws.path}
                  className="wm-card rounded-lg p-4 transition-colors cursor-pointer"
                  onClick={() => handleOpenWorkspace(ws.path)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold wm-title truncate">
                        {name}
                      </h3>
                      {ws.metadata?.description && (
                        <p className="text-xs wm-subtle mt-1">
                          {ws.metadata.description}
                        </p>
                      )}
                      <p className="text-xs wm-muted mt-1">
                        Created {createdAt}
                      </p>
                      <p className="text-xs wm-subtle mt-1 truncate">
                        {ws.path}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditWorkspace(ws);
                      }}
                      className="wm-icon-button ml-2 p-1 transition-colors"
                      title="Edit workspace"
                      type="button"
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Workspace Dialog */}
      <CreateWorkspaceDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={loadWorkspaces}
      />

      {/* Add Existing Workspace Dialog */}
      <AddExistingWorkspaceDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdded={loadWorkspaces}
      />

      {/* Edit Workspace Dialog */}
      {editingWorkspace && (
        <EditWorkspaceDialog
          workspace={editingWorkspace}
          onClose={() => setEditingWorkspace(null)}
          onSaved={loadWorkspaces}
        />
      )}
    </div>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [useCustomLocation, setUseCustomLocation] = useState(false);
  const [customLocation, setCustomLocation] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleBrowse = async () => {
    try {
      const folderPath = await window.quest.workspace.selectFolder();
      if (folderPath) {
        setCustomLocation(folderPath);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (useCustomLocation && !customLocation.trim()) {
      alert('Please select a location');
      return;
    }

    setIsCreating(true);
    try {
      // Create workspace (with custom path if specified)
      const workspacePath = await window.quest.workspace.create(
        name.trim(),
        useCustomLocation ? customLocation : undefined
      );

      // Update metadata with description if provided
      if (description.trim()) {
        await window.quest.workspace.updateMetadata(workspacePath, {
          description: description.trim()
        });
      }

      await onCreated();
      onOpenChange(false);
      setName('');
      setDescription('');
      setUseCustomLocation(false);
      setCustomLocation('');
    } catch (error) {
      console.error('Failed to create workspace:', error);
      alert('Failed to create workspace');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wm-overlay" />
        <Dialog.Content className="wm-dialog p-6" style={{ width: '500px' }}>
          <Dialog.Title className="text-lg font-semibold mb-4 wm-title">
            Create New Workspace
          </Dialog.Title>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 wm-subtle">
                Workspace Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My API Project"
                className="wm-input w-full px-3 py-2 text-sm rounded"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 wm-subtle">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description for this workspace"
                rows={3}
                className="wm-input w-full px-3 py-2 text-sm rounded resize-none"
              />
            </div>

            {/* Custom Location */}
            <div className="border-t wm-border pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomLocation}
                  onChange={(e) => setUseCustomLocation(e.target.checked)}
                />
                <span className="text-sm wm-subtle">
                  Use custom location
                </span>
              </label>

              {useCustomLocation && (
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-2 wm-subtle">
                    Parent Folder *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      placeholder="Select parent folder..."
                      className="wm-input flex-1 px-3 py-2 text-sm rounded"
                      readOnly
                    />
                    <button
                      onClick={handleBrowse}
                      className="wm-button wm-button-muted px-3 py-2 text-xs transition-colors"
                      type="button"
                    >
                      Browse...
                    </button>
                  </div>
                  <p className="text-xs wm-muted mt-1">
                    Workspace will be created at: {customLocation ? `${customLocation}/${name || '(name)'}` : '(select a folder)'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="wm-button wm-button-muted px-3 py-2 text-xs transition-colors">
              Cancel
            </Dialog.Close>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating || (useCustomLocation && !customLocation.trim())}
              className="wm-button wm-button-primary px-3 py-2 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {isCreating ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddExistingWorkspaceDialog({
  open,
  onOpenChange,
  onAdded
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [selectedPath, setSelectedPath] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleBrowse = async () => {
    try {
      const folderPath = await window.quest.workspace.selectFolder();
      if (folderPath) {
        setSelectedPath(folderPath);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  const handleAdd = async () => {
    if (!selectedPath.trim()) return;

    setIsAdding(true);
    try {
      // Check if workspace.json exists, if not create it
      const metadata = await window.quest.workspace.getMetadata(selectedPath);
      if (!metadata) {
        // Workspace doesn't have metadata, create it
        const folderName = selectedPath.split(/[\\/]/).pop() || 'Workspace';
        await window.quest.workspace.updateMetadata(selectedPath, {
          id: crypto.randomUUID(),
          name: folderName,
          createdAt: new Date().toISOString()
        });
      }

      await onAdded();
      onOpenChange(false);
      setSelectedPath('');
    } catch (error) {
      console.error('Failed to add workspace:', error);
      alert('Failed to add workspace. Make sure the folder contains valid workspace structure.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wm-overlay" />
        <Dialog.Content className="wm-dialog p-6" style={{ width: '600px' }}>
          <Dialog.Title className="text-lg font-semibold mb-2 wm-title">
            Add Existing Workspace
          </Dialog.Title>
          <Dialog.Description className="text-sm wm-muted mb-4">
            Select a folder containing an existing ApiQuest workspace
          </Dialog.Description>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 wm-subtle">
                Workspace Path *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
                  placeholder="Select a folder..."
                  className="wm-input flex-1 px-3 py-2 text-sm rounded"
                  readOnly
                />
                <button
                  onClick={handleBrowse}
                  className="wm-button wm-button-muted px-3 py-2 text-sm transition-colors"
                  type="button"
                >
                  Browse...
                </button>
              </div>
              <p className="text-xs wm-muted mt-2">
                The folder should contain collections/ and environments/ subdirectories
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close className="wm-button wm-button-muted px-4 py-2 text-sm transition-colors">
              Cancel
            </Dialog.Close>
            <button
              onClick={handleAdd}
              disabled={!selectedPath.trim() || isAdding}
              className="wm-button wm-button-primary px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {isAdding ? 'Adding...' : 'Add Workspace'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditWorkspaceDialog({
  workspace,
  onClose,
  onSaved
}: {
  workspace: { path: string; name: string; description?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await window.quest.workspace.updateMetadata(workspace.path, {
        name: name.trim(),
        description: description.trim() || undefined
      });

      await onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to update workspace:', error);
      alert('Failed to update workspace');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="wm-overlay" />
        <Dialog.Content className="wm-dialog p-6" style={{ width: '500px' }}>
          <Dialog.Title className="text-lg font-semibold mb-4 wm-title">
            Edit Workspace
          </Dialog.Title>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 wm-subtle">
                Workspace Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="wm-input w-full px-3 py-2 text-sm rounded"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 wm-subtle">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description for this workspace"
                rows={3}
                className="wm-input w-full px-3 py-2 text-sm rounded resize-none"
              />
            </div>

            <div className="text-xs wm-muted">
              <strong>Path:</strong> {workspace.path}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="wm-button wm-button-muted px-4 py-2 text-sm transition-colors"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || isSaving}
              className="wm-button wm-button-primary px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
