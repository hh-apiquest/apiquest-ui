// Sidebar - Simple container with tabs for Collections and Environments
import { useWorkspace } from '../../contexts';
import * as Tabs from '@radix-ui/react-tabs';
import { CollectionsPanel } from './CollectionsPanel';
import { EnvironmentsPanel } from './EnvironmentsPanel';

export function Sidebar() {
  const { workspace } = useWorkspace();
  if (!workspace) return null;

  return (
    <div className="flex flex-col h-full">
      <Tabs.Root defaultValue="collections" className="flex flex-col h-full">
        <Tabs.List className="flex items-center border-b h-9" style={{ height:30, background: 'var(--gray-2)' }}>
          <style>{`
            .sidebar-tab-trigger[data-state=active] {
              background: var(--gray-3);
              border-bottom: 2px solid var(--accent-9);
            }
          `}</style>
          <Tabs.Trigger 
            value="collections"
            className="sidebar-tab-trigger flex-1 px-3 py-2 text-xs font-medium cursor-pointer border-none bg-transparent"
          >
            Collections
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="environments"
            className="sidebar-tab-trigger flex-1 px-3 py-2 text-xs font-medium cursor-pointer border-none bg-transparent"
          >
            Environments
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="collections" className="flex-1 overflow-auto p-2">
          <CollectionsPanel />
        </Tabs.Content>

        <Tabs.Content value="environments" className="flex-1 overflow-auto p-2">
          <EnvironmentsPanel />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
