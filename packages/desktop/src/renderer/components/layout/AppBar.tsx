// AppBar - Compact top menu with workspace management
import { useState, useEffect } from 'react';
import { useWorkspace, useTheme, useSettings, useScreenMode } from '../../contexts';
import type { WorkspaceWithMetadata } from '../../types/quest';
import type { Variable } from '@apiquest/types';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { TextField } from '@radix-ui/themes';
import { VariableEditorDialog } from '../variables/VariableEditor';
import appLogo from '../../assets/logo.svg';
import {
  FolderIcon,
  GlobeAltIcon,
  VariableIcon,
  ChevronDownIcon,
  CheckIcon,
  SunIcon,
  MoonIcon,
  Cog6ToothIcon,
  MinusIcon,
  Square2StackIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

export function AppBar() {
  const { workspace, openWorkspace, activeEnvironment, setActiveEnvironment } = useWorkspace();
  const { theme, actualTheme, setTheme } = useTheme();
  const { settings } = useSettings();
  const { setMode } = useScreenMode();
  const [showGlobalVars, setShowGlobalVars] = useState(false);
  const [globalVariables, setGlobalVariables] = useState<Record<string, string | Variable>>({});
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMetadata[]>([]);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    loadGlobalVariables();
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      loadWorkspaces();
    }
  }, [dropdownOpen]);

  const loadGlobalVariables = async () => {
    try {
      const vars = await window.quest.globalVariables.load();
      setGlobalVariables(vars);
    } catch (error) {
      console.error('Failed to load global variables:', error);
    }
  };

  const loadWorkspaces = async () => {
    try {
      const result = await window.quest.workspace.listWithMetadata();
      setWorkspaces(result);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }
  };

  const handleSaveGlobalVars = async (vars: Record<string, string | Variable>) => {
    try {
      await window.quest.globalVariables.save(vars);
      setGlobalVariables(vars);
    } catch (error) {
      console.error('Failed to save global variables:', error);
    }
  };

  const workspaceDropdownLimit = settings?.ui?.workspaceDropdownLimit || 20;

  const portalContainer =
    typeof document !== 'undefined'
      ? ((document.querySelector('.radix-themes') as HTMLElement | null) ?? document.body)
      : undefined;

  const filteredWorkspaces = workspaces
    .filter((ws) => {
      const name = ws.metadata?.name || ws.path.split(/[\\/]/).pop() || '';
      return name.toLowerCase().includes(workspaceSearch.toLowerCase());
    })
    .slice(0, workspaceDropdownLimit);

  return (
    <div
      className="h-10 border-b flex items-center justify-between px-2"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center gap-1">
        <img
          src={appLogo}
          alt="ApiQuest"
          style={{
            width: '24px',
            height: '24px',
            marginRight: '4px'
          }}
          draggable={false}
        />
        <DropdownMenu.Root open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenu.Trigger
            className="inline-flex items-center gap-1 px-2 text-xs font-medium rounded"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              WebkitAppRegion: 'no-drag'
            } as any}
          >
            <FolderIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
            <span>{workspace?.name || 'No Workspace'}</span>
            <ChevronDownIcon className="w-3.5 h-3.5" style={{ color: 'var(--gray-9)' }} />
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal container={portalContainer}>
            <DropdownMenu.Content style={{ minWidth: '300px', background: 'var(--color-background)', border: '1px solid var(--gray-6)', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '8px', zIndex: 50 }}>
              <div className="px-2 py-1 mb-1">
                <TextField.Root
                  size="1"
                  placeholder="Search workspaces..."
                  value={workspaceSearch}
                  onChange={(e) => setWorkspaceSearch(e.target.value)}
                  className="w-full"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <DropdownMenu.Separator style={{ height: '1px', background: 'var(--gray-6)', margin: '4px 0' }} />

              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {filteredWorkspaces.length === 0 ? (
                  <div style={{ padding: '8px', fontSize: '12px', color: 'var(--gray-9)', textAlign: 'center' }}>
                    No workspaces found
                  </div>
                ) : (
                  filteredWorkspaces.map((ws) => {
                    const name = ws.metadata?.name || ws.path.split(/[\\/]/).pop() || 'Unnamed';
                    const isActive = workspace?.path === ws.path;
                    
                    return (
                      <DropdownMenu.Item
                        key={ws.path}
                        className="px-2 py-1 text-xs rounded cursor-pointer"
                        style={{ background: isActive ? 'var(--accent-3)' : 'transparent' }}
                        onSelect={async () => {
                          await openWorkspace(ws.path);
                          setDropdownOpen(false);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{name}</div>
                            <div className="text-xxs truncate" style={{ color: 'var(--gray-9)' }}>{ws.path}</div>
                          </div>
                          {isActive && <CheckIcon className="w-3.5 h-3.5" style={{ marginLeft: '8px', color: 'var(--accent-9)' }} />}
                        </div>
                      </DropdownMenu.Item>
                    );
                  })
                )}
              </div>

              <DropdownMenu.Separator style={{ height: '1px', background: 'var(--gray-6)', margin: '4px 0' }} />

              <DropdownMenu.Item
                className="px-2 py-1 text-xs rounded cursor-pointer font-medium"
                onSelect={() => {
                  setMode('workspace-manager');
                  setDropdownOpen(false);
                }}
              >
                + Create Workspace
              </DropdownMenu.Item>
              
              <DropdownMenu.Item
                className="px-2 py-1 text-xs rounded cursor-pointer"
                onSelect={() => {
                  setMode('workspace-manager');
                  setDropdownOpen(false);
                }}
              >
                <Cog6ToothIcon style={{ width: '12px', height: '12px', display: 'inline', marginRight: '4px' }} /> Manage Workspaces
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div style={{ height: '24px', width: '1px', background: 'var(--gray-7)' }} />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            className="inline-flex items-center gap-1 px-2 text-xs rounded"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              WebkitAppRegion: 'no-drag'
            } as any}
          >
            <GlobeAltIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
            <span>{activeEnvironment?.name || 'No Environment'}</span>
            <ChevronDownIcon className="w-3.5 h-3.5" style={{ color: 'var(--gray-9)' }} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal container={portalContainer}>
            <DropdownMenu.Content style={{ minWidth: '200px', background: 'var(--color-background)', border: '1px solid var(--gray-6)', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '4px', zIndex: 50 }}>
              <DropdownMenu.Item 
                className="px-2 py-1 text-xs rounded cursor-pointer"
                onSelect={() => setActiveEnvironment(null)}
              >
                <div className="flex items-center justify-between">
                  <span>No Environment</span>
                  {!activeEnvironment && <CheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent-9)' }} />}
                </div>
              </DropdownMenu.Item>
              {workspace && workspace.environments.length > 0 && (
                <>
                  <DropdownMenu.Separator style={{ height: '1px', background: 'var(--gray-6)', margin: '4px 0' }} />
                  {workspace.environments.map((env) => (
                    <DropdownMenu.Item
                      key={env.id}
                      className="px-2 py-1 text-xs rounded cursor-pointer"
                      onSelect={() => setActiveEnvironment(env)}
                    >
                      <div className="flex items-center justify-between">
                        <span>{env.name}</span>
                        {activeEnvironment?.id === env.id && <CheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent-9)' }} />}
                      </div>
                    </DropdownMenu.Item>
                  ))}
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div style={{ height: '24px', width: '1px', background: 'var(--gray-7)' }} />

        <button
          onClick={() => setShowGlobalVars(true)}
          className="inline-flex items-center gap-1 px-2 text-xs rounded"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            WebkitAppRegion: 'no-drag'
          } as any}
          title="Global Variables"
        >
          <VariableIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
          <span>Global Variables</span>
        </button>
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          className="p-1 rounded cursor-pointer"
          style={{ border: 'none', background: 'transparent' }}
          title="Settings"
          onClick={() => setMode('settings')}
        >
          <Cog6ToothIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
        </button>

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1 rounded cursor-pointer"
          style={{ border: 'none', background: 'transparent' }}
          title="Toggle theme"
        >
          {theme === 'dark' ? (
            <SunIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
          ) : (
            <MoonIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
          )}
        </button>

        <div style={{ height: '24px', width: '1px', background: 'var(--gray-7)', margin: '0 4px' }} />

        <button
          onClick={() => window.quest.window.minimize()}
          className="p-1 rounded cursor-pointer"
          style={{ border: 'none', background: 'transparent' }}
          title="Minimize"
        >
          <MinusIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
        </button>
        <button
          onClick={() => window.quest.window.maximize()}
          className="p-1 rounded cursor-pointer"
          style={{ border: 'none', background: 'transparent' }}
          title="Maximize/Restore"
        >
          <Square2StackIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
        </button>
        <button
          onClick={() => window.quest.window.close()}
          className="p-1 rounded cursor-pointer"
          style={{ border: 'none', background: 'transparent' }}
          title="Close"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <VariableEditorDialog
        open={showGlobalVars}
        onOpenChange={setShowGlobalVars}
        title="Global Variables"
        variables={globalVariables}
        onSave={handleSaveGlobalVars}
        showEnabled={false}
      />
    </div>
  );
}
