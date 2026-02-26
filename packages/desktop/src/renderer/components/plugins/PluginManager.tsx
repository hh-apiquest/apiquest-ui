import React from 'react';
import {
  Text,
  Button,
  TextField,
  Badge,
  Table,
  Dialog,
  Flex,
  Box,
  Switch,
  IconButton,
  Card,
  Tabs
} from '@radix-ui/themes';
import {
  PuzzlePieceIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { pluginManagerService } from '../../services/PluginManagerService';
import type { InstalledPluginInfo } from '../../types/plugin';
import type { ApiquestMetadata } from '@apiquest/plugin-ui-types';

type PluginTypeFilter = Extract<
  ApiquestMetadata['type'],
  'auth-ui' |
  'protocol-ui' |
  'importer-ui' |
  'exporter-ui' |
  'visualizer-ui' |
  'extension-ui'
  > | 'all';

interface PluginManagerProps {
  // Optional filter to show specific plugin type
  pluginType?: PluginTypeFilter;
  // Optional initial search query (e.g., specific protocol/auth name)
  initialSearch?: string;
  // Optional callback when a plugin is installed
  onPluginInstalled?: (pluginId: string) => void;
}

export function PluginManager({
  pluginType = 'all',
  initialSearch = '',
  onPluginInstalled
}: PluginManagerProps = {}) {
  const [installedPlugins, setInstalledPlugins] = React.useState<InstalledPluginInfo[]>([]);
  const [searchQuery, setSearchQuery] = React.useState(initialSearch);
  const [installing, setInstalling] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('installed');
  const [selectedType, setSelectedType] = React.useState<PluginTypeFilter>(pluginType);

  // Marketplace state
  const [marketplacePlugins, setMarketplacePlugins] = React.useState<any[]>([]);
  const [searchingMarketplace, setSearchingMarketplace] = React.useState(false);

  React.useEffect(() => {
    loadInstalledPlugins();

    // Listen for plugin changes
    const handlePluginsReloaded = () => {
      loadInstalledPlugins();
    };

    pluginManagerService.on('pluginsReloaded', handlePluginsReloaded);

    return () => {
      pluginManagerService.off('pluginsReloaded', handlePluginsReloaded);
    };
  }, []);

  const loadInstalledPlugins = () => {
    const plugins = pluginManagerService.getInstalledPlugins();
    setInstalledPlugins(plugins);
  };

  const handleTogglePlugin = async (pluginId: string, enabled: boolean) => {
    try {
      await pluginManagerService.setPluginEnabled(pluginId, enabled);
      loadInstalledPlugins();
    } catch (err) {
      console.error('Failed to toggle plugin:', err);
    }
  };

  const handleInstallPlugin = async (packageName: string) => {
    setInstalling(true);
    try {
      // Call IPC to install plugin from npm
      const success = await window.quest.plugins.install(packageName);
      if (success) {
        console.log('Plugin installed:', packageName);
        await pluginManagerService.reloadPlugins();
        loadInstalledPlugins();
        onPluginInstalled?.(packageName);
      } else {
        console.error('Failed to install plugin');
      }
    } catch (err) {
      console.error('Failed to install plugin:', err);
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstallPlugin = async (pluginId: string) => {
    try {
      const success = await window.quest.plugins.remove(pluginId);
      if (success) {
        await pluginManagerService.reloadPlugins();
        loadInstalledPlugins();
      }
    } catch (err) {
      console.error('Failed to uninstall plugin:', err);
    }
  };

  const handleSearchMarketplace = async () => {
    setSearchingMarketplace(true);
    try {
      // Search npmjs for @apiquest/* packages
      const query = searchQuery || (selectedType !== 'all' ? `plugin-${selectedType}` : '');
      const results = await window.quest.plugins.searchMarketplace(query, selectedType);
      setMarketplacePlugins(results);
    } catch (err) {
      console.error('Failed to search marketplace:', err);
      setMarketplacePlugins([]);
    } finally {
      setSearchingMarketplace(false);
    }
  };

  const filteredPlugins = installedPlugins.filter(p => {
    const matchesSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase());

    // Map UI filter type to installed plugin type: 'protocol-ui' -> 'protocol', 'auth-ui' -> 'auth'
    const matchesType = selectedType === 'all' ||
      (selectedType === 'protocol-ui' && p.type === 'protocol') ||
      (selectedType === 'auth-ui' && p.type === 'auth');

    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--gray-6)' }}>
        <div className="flex items-center gap-2">
          <PuzzlePieceIcon className="w-5 h-5" style={{ color: 'var(--accent-9)' }} />
          <Text size="4" weight="medium">Plugin Manager</Text>
        </div>
        <Button
          variant="soft"
          onClick={() => pluginManagerService.reloadPlugins()}
        >
          <ArrowPathIcon className="w-4 h-4" />
          Reload
        </Button>
      </div>

      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Trigger value="installed">
            Installed ({installedPlugins.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="marketplace">
            Marketplace
          </Tabs.Trigger>
        </Tabs.List>

        {/* Installed Plugins Tab */}
        <Tabs.Content value="installed">
          <div className="p-4">
            {/* Search & Filter */}
            <div className="mb-4 flex gap-2">
              <Box flexGrow="1">
                <TextField.Root
                  placeholder="Search installed plugins..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                >
                  <TextField.Slot>
                    <MagnifyingGlassIcon className="w-4 h-4" />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              <Tabs.Root value={selectedType} onValueChange={(v) => setSelectedType(v as any)}>
                <Tabs.List>
                  <Tabs.Trigger value="all">All</Tabs.Trigger>
                  <Tabs.Trigger value="protocol">Protocol</Tabs.Trigger>
                  <Tabs.Trigger value="auth">Auth</Tabs.Trigger>
                </Tabs.List>
              </Tabs.Root>
            </div>

            {/* Plugins Table */}
            {filteredPlugins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <PuzzlePieceIcon className="w-12 h-12 mb-4" style={{ color: 'var(--gray-8)' }} />
                <Text size="3" color="gray">
                  {searchQuery ? 'No plugins found' : 'No plugins installed'}
                </Text>
                <Text size="2" color="gray" className="mt-2">
                  {!searchQuery && 'Install plugins from the Marketplace tab'}
                </Text>
              </div>
            ) : (
              <Table.Root variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Plugin</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Version</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredPlugins.map((plugin) => (
                    <Table.Row key={plugin.id}>
                      <Table.Cell>
                        <div className="flex flex-col gap-1">
                          <Text size="2" weight="medium">{plugin.name}</Text>
                          <Text size="1" color="gray">{plugin.id}</Text>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={plugin.type === 'protocol' ? 'blue' : 'green'}>
                          {plugin.type}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2">{plugin.version}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={plugin.enabled}
                            onCheckedChange={(checked) => handleTogglePlugin(plugin.id, checked)}
                            disabled={plugin.bundled}
                          />
                          <Text size="2" color={plugin.enabled ? 'green' : 'gray'}>
                            {plugin.enabled ? 'Enabled' : 'Disabled'}
                          </Text>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        {!plugin.bundled && (
                          <IconButton
                            variant="soft"
                            color="red"
                            onClick={() => handleUninstallPlugin(plugin.id)}
                          >
                            <TrashIcon className="w-4 h-4" />
                          </IconButton>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </div>
        </Tabs.Content>

        {/* Marketplace Tab */}
        <Tabs.Content value="marketplace">
          <div className="p-4">
            {/* Search & Filter */}
            <div className="mb-4 flex flex-col gap-2">
              <Flex gap="2">
                <Box flexGrow="1">
                  <TextField.Root
                    placeholder={`Search @apiquest/${selectedType !== 'all' ? `plugin-${selectedType}-*` : '*'} packages on npmjs...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearchMarketplace();
                      }
                    }}
                  >
                    <TextField.Slot>
                      <MagnifyingGlassIcon className="w-4 h-4" />
                    </TextField.Slot>
                  </TextField.Root>
                </Box>
                <Button
                  onClick={handleSearchMarketplace}
                  loading={searchingMarketplace}
                >
                  Search
                </Button>
              </Flex>
              <Tabs.Root value={selectedType} onValueChange={(v) => setSelectedType(v as any)}>
                <Tabs.List>
                  <Tabs.Trigger value="all">All Plugins</Tabs.Trigger>
                  <Tabs.Trigger value="protocol">Protocol Plugins</Tabs.Trigger>
                  <Tabs.Trigger value="auth">Auth Plugins</Tabs.Trigger>
                </Tabs.List>
              </Tabs.Root>
            </div>

            {/* Marketplace Results */}
            {marketplacePlugins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <PuzzlePieceIcon className="w-12 h-12 mb-4" style={{ color: 'var(--gray-8)' }} />
                <Text size="3" color="gray">
                  Search for plugins on npmjs
                </Text>
                <Text size="2" color="gray" className="mt-2">
                  Enter a search query or package name to find plugins
                </Text>
              </div>
            ) : (
              <div className="grid gap-3">
                {marketplacePlugins.map((pkg) => {
                  const isInstalled = installedPlugins.some(p => p.id === pkg.name);

                  return (
                    <Card key={pkg.name}>
                      <Flex justify="between" align="center">
                        <div className="flex flex-col gap-1">
                          <Text size="3" weight="medium">{pkg.name}</Text>
                          <Text size="2" color="gray">{pkg.description}</Text>
                          <div className="flex gap-2 mt-2">
                            <Badge>{pkg.version}</Badge>
                            {pkg.apiquest && (
                              <Badge color="blue">{pkg.apiquest.type}</Badge>
                            )}
                          </div>
                        </div>
                        <div>
                          {isInstalled ? (
                            <Button disabled>
                              <CheckCircleIcon className="w-4 h-4" />
                              Installed
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleInstallPlugin(pkg.name)}
                              loading={installing}
                            >
                              <ArrowDownTrayIcon className="w-4 h-4" />
                              Install
                            </Button>
                          )}
                        </div>
                      </Flex>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
