import React from 'react';
import { Tabs, Text, Box } from '@radix-ui/themes';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useScreenMode } from '../../contexts';
import { PluginManager } from '../plugins/PluginManager';

export function SettingsPanel() {
  const { setMode } = useScreenMode();
  
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--gray-1)' }}>
      {/* Top Bar with Back Button */}
      <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--gray-6)', background: 'var(--gray-2)' }}>
        <button
          onClick={() => setMode('request-editor')}
          className="px-3 py-1 text-sm inline-flex items-center gap-2 border rounded transition-colors"
          style={{ 
            borderColor: 'var(--gray-6)', 
            color: 'var(--gray-10)',
            background: 'transparent'
          }}
          type="button"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
      </div>
      
     <div className="flex flex-1 overflow-hidden">
      {/* Vertical tabs on the left */}
      <Tabs.Root defaultValue="general" orientation="vertical" className="flex h-full w-full">
        <Tabs.List 
          className="flex flex-col border-r" 
          style={{ 
            width: '200px',
            borderColor: 'var(--gray-6)',
            background: 'var(--gray-2)',
            padding: '1rem 0'
          }}
        >
          <style>{`
            .settings-tab-trigger[data-state=active] {
              background: var(--accent-3);
              border-right: 2px solid var(--accent-9);
            }
          `}</style>
          <Tabs.Trigger 
            value="general"
            className="settings-tab-trigger px-4 py-3 text-sm font-medium cursor-pointer border-none bg-transparent text-left"
          >
            General
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="plugins"
            className="settings-tab-trigger px-4 py-3 text-sm font-medium cursor-pointer border-none bg-transparent text-left"
          >
            Plugins
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="appearance"
            className="settings-tab-trigger px-4 py-3 text-sm font-medium cursor-pointer border-none bg-transparent text-left"
          >
            Appearance
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="shortcuts"
            className="settings-tab-trigger px-4 py-3 text-sm font-medium cursor-pointer border-none bg-transparent text-left"
          >
            Keyboard Shortcuts
          </Tabs.Trigger>
        </Tabs.List>

        {/* Content area */}
        <Box flexGrow="1" className="overflow-hidden">
          <Tabs.Content value="general" className="h-full overflow-auto p-6">
            <Text size="4" weight="medium">General Settings</Text>
            <Text size="2" color="gray" className="mt-2 block">
              General application settings - Coming soon
            </Text>
          </Tabs.Content>

          <Tabs.Content value="plugins" className="h-full overflow-hidden">
            <PluginManager />
          </Tabs.Content>

          <Tabs.Content value="appearance" className="h-full overflow-auto p-6">
            <Text size="4" weight="medium">Appearance Settings</Text>
            <Text size="2" color="gray" className="mt-2 block">
              Theme and appearance customization - Coming soon
            </Text>
          </Tabs.Content>

          <Tabs.Content value="shortcuts" className="h-full overflow-auto p-6">
            <Text size="4" weight="medium">Keyboard Shortcuts</Text>
            <Text size="2" color="gray" className="mt-2 block">
              Customize keyboard shortcuts - Coming soon
            </Text>
          </Tabs.Content>
        </Box>
      </Tabs.Root>
      </div>
    </div>
  );
}
