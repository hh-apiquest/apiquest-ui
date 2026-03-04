import React from 'react';
import {
  Text,
  Button,
  TextField,
  Badge,
  Table,
  Flex,
  Box,
  Switch,
  IconButton,
  Spinner,
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
  pluginType?: PluginTypeFilter;
  initialSearch?: string;
  onPluginInstalled?: (pluginId: string) => void;
}

export function PluginManager({
  pluginType = 'all',
  initialSearch = '',
  onPluginInstalled
}: PluginManagerProps = {}) {
  const [installedPlugins, setInstalledPlugins] = React.useState<InstalledPluginInfo[]>([]);
  const [installedSearchQuery, setInstalledSearchQuery] = React.useState(initialSearch);
  const [installing, setInstalling] = React.useState<string | null>(null);
  const [installError, setInstallError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState('installed');
  const [selectedType, setSelectedType] = React.useState<PluginTypeFilter>(pluginType);

  // Marketplace: full list from npm, filtered client-side
  const [allMarketplacePlugins, setAllMarketplacePlugins] = React.useState<any[]>([]);
  const [marketplaceLoaded, setMarketplaceLoaded] = React.useState(false);
  const [loadingMarketplace, setLoadingMarketplace] = React.useState(false);
  const [marketplaceSearchQuery, setMarketplaceSearchQuery] = React.useState('');

  React.useEffect(() => {
    loadInstalledPlugins();
    const handlePluginsReloaded = () => loadInstalledPlugins();
    pluginManagerService.on('pluginsReloaded', handlePluginsReloaded);
    return () => {
      pluginManagerService.off('pluginsReloaded', handlePluginsReloaded);
    };
  }, []);

  // Auto-load marketplace on first visit to that tab
  React.useEffect(() => {
    if (activeTab === 'marketplace' && !marketplaceLoaded) {
      loadMarketplace();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInstalledPlugins = () => {
    setInstalledPlugins(pluginManagerService.getInstalledPlugins());
  };

  const loadMarketplace = async () => {
    setLoadingMarketplace(true);
    try {
      const results = await window.quest.plugins.searchMarketplace('', 'all');
      setAllMarketplacePlugins(results);
      setMarketplaceLoaded(true);
    } catch (err) {
      console.error('[PluginManager] Failed to load marketplace:', err);
      setAllMarketplacePlugins([]);
    } finally {
      setLoadingMarketplace(false);
    }
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
    setInstalling(packageName);
    setInstallError(null);
    try {
      const result = await window.quest.plugins.install(packageName);
      if (result.success) {
        await pluginManagerService.reloadPlugins();
        loadInstalledPlugins();
        onPluginInstalled?.(packageName);
      } else {
        setInstallError(result.error || 'Installation failed for an unknown reason.');
      }
    } catch (err: any) {
      setInstallError(err?.message || 'Unexpected error during plugin installation.');
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstallPlugin = async (pluginId: string) => {
    console.log('[PluginManager] Uninstalling plugin:', pluginId);
    try {
      await window.quest.plugins.remove(pluginId);
      await pluginManagerService.reloadPlugins();
      loadInstalledPlugins();
    } catch (err) {
      console.error('[PluginManager] Failed to uninstall plugin:', err);
    }
  };

  const filteredInstalledPlugins = installedPlugins.filter(p => {
    const q = installedSearchQuery.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    const matchesType = selectedType === 'all' || p.type === selectedType;
    return matchesSearch && matchesType;
  });

  const filteredMarketplacePlugins = allMarketplacePlugins.filter(pkg => {
    const q = marketplaceSearchQuery.toLowerCase();
    const matchesSearch = !q ||
      pkg.name?.toLowerCase().includes(q) ||
      pkg.description?.toLowerCase().includes(q);
    const matchesType = selectedType === 'all' || pkg.apiquest?.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--gray-6)' }}>
        <Flex align="center" gap="2">
          <PuzzlePieceIcon className="w-5 h-5" style={{ color: 'var(--accent-9)' }} />
          <Text size="4" weight="medium">Plugin Manager</Text>
        </Flex>
        <Button size="1" variant="soft" onClick={() => pluginManagerService.reloadPlugins()}>
          <ArrowPathIcon className="w-3 h-3" />
          Reload Plugins
        </Button>
      </div>

      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Tabs.List>
          <Tabs.Trigger value="installed">
            Installed ({installedPlugins.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="marketplace">
            Marketplace {marketplaceLoaded && allMarketplacePlugins.length > 0 ? `(${allMarketplacePlugins.length})` : ''}
          </Tabs.Trigger>
        </Tabs.List>

        {/* Installed Plugins Tab */}
        <Tabs.Content value="installed" style={{ flex: 1, overflow: 'auto' }}>
          <div className="p-4">
            <Flex gap="2" mb="3">
              <Box flexGrow="1">
                <TextField.Root
                  size="1"
                  placeholder="Search installed plugins..."
                  value={installedSearchQuery}
                  onChange={(e) => setInstalledSearchQuery(e.target.value)}
                >
                  <TextField.Slot>
                    <MagnifyingGlassIcon className="w-3 h-3" />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              <Tabs.Root value={selectedType} onValueChange={(v) => setSelectedType(v as PluginTypeFilter)}>
                <Tabs.List size="1">
                  <Tabs.Trigger value="all">All</Tabs.Trigger>
                  <Tabs.Trigger value="protocol-ui">Protocol</Tabs.Trigger>
                  <Tabs.Trigger value="auth-ui">Auth</Tabs.Trigger>
                </Tabs.List>
              </Tabs.Root>
            </Flex>

            {filteredInstalledPlugins.length === 0 ? (
              <Flex direction="column" align="center" justify="center" py="8" gap="2">
                <PuzzlePieceIcon className="w-10 h-10" style={{ color: 'var(--gray-7)' }} />
                <Text size="2" color="gray">
                  {installedSearchQuery ? 'No plugins match your search' : 'No plugins installed'}
                </Text>
                {!installedSearchQuery && (
                  <Text size="1" color="gray">Install plugins from the Marketplace tab</Text>
                )}
              </Flex>
            ) : (
              <Table.Root size="1" variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Plugin</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Version</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Enabled</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell></Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredInstalledPlugins.map((plugin) => (
                    <Table.Row key={plugin.id} style={{ verticalAlign: 'middle' }}>
                      <Table.Cell style={{ verticalAlign: 'middle' }}>
                        <Flex direction="column" gap="1">
                          <Text size="1" weight="medium">{plugin.name}</Text>
                          <Text size="1" color="gray">{plugin.id}</Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell style={{ verticalAlign: 'middle' }}>
                        <Badge size="1" color={plugin.type === 'protocol-ui' ? 'blue' : plugin.type === 'auth-ui' ? 'green' : 'gray'}>
                          {plugin.type}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell style={{ verticalAlign: 'middle' }}>
                        <Text size="1">{plugin.version}</Text>
                      </Table.Cell>
                      <Table.Cell style={{ verticalAlign: 'middle' }}>
                        <Flex align="center" gap="2">
                          <Switch
                            size="1"
                            checked={plugin.enabled}
                            onCheckedChange={(checked) => handleTogglePlugin(plugin.id, checked)}
                            disabled={plugin.bundled}
                          />
                          <Text size="1" color={plugin.enabled ? 'green' : 'gray'}>
                            {plugin.enabled ? 'On' : 'Off'}
                          </Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell style={{ verticalAlign: 'middle' }}>
                        {!plugin.bundled && (
                          <IconButton
                            size="1"
                            variant="ghost"
                            color="red"
                            onClick={() => handleUninstallPlugin(plugin.id)}
                          >
                            <TrashIcon className="w-3 h-3" />
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
        <Tabs.Content value="marketplace" style={{ flex: 1, overflow: 'auto' }}>
          <div className="p-4">
            <Flex gap="2" mb="3" align="center">
              <Box flexGrow="1">
                <TextField.Root
                  size="1"
                  placeholder="Filter by name or description..."
                  value={marketplaceSearchQuery}
                  onChange={(e) => setMarketplaceSearchQuery(e.target.value)}
                >
                  <TextField.Slot>
                    <MagnifyingGlassIcon className="w-3 h-3" />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              <Button
                size="1"
                variant="soft"
                onClick={loadMarketplace}
                disabled={loadingMarketplace}
              >
                {loadingMarketplace ? <Spinner size="1" /> : <ArrowPathIcon className="w-3 h-3" />}
                {loadingMarketplace ? 'Loading...' : 'Refresh'}
              </Button>
            </Flex>

            <Flex mb="3">
              <Tabs.Root value={selectedType} onValueChange={(v) => setSelectedType(v as PluginTypeFilter)}>
                <Tabs.List size="1">
                  <Tabs.Trigger value="all">All</Tabs.Trigger>
                  <Tabs.Trigger value="protocol-ui">Protocol</Tabs.Trigger>
                  <Tabs.Trigger value="auth-ui">Auth</Tabs.Trigger>
                </Tabs.List>
              </Tabs.Root>
            </Flex>

            {/* Installation error */}
            {installError && (
              <Flex
                align="start"
                gap="2"
                mb="3"
                p="2"
                style={{
                  background: 'var(--red-3)',
                  border: '1px solid var(--red-6)',
                  borderRadius: '6px'
                }}
              >
                <XCircleIcon style={{ width: '14px', height: '14px', color: 'var(--red-9)', flexShrink: 0, marginTop: '2px' }} />
                <Box style={{ flex: 1 }}>
                  <Text size="1" weight="medium" style={{ color: 'var(--red-11)', display: 'block' }}>
                    Installation failed
                  </Text>
                  <Text size="1" style={{ color: 'var(--red-11)' }}>{installError}</Text>
                </Box>
                <button
                  onClick={() => setInstallError(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-9)', padding: 0, flexShrink: 0 }}
                  aria-label="Dismiss"
                >
                  <XCircleIcon style={{ width: '12px', height: '12px' }} />
                </button>
              </Flex>
            )}

            {/* Results */}
            {loadingMarketplace ? (
              <Flex direction="column" align="center" justify="center" py="8" gap="2">
                <Spinner size="3" />
                <Text size="2" color="gray">Loading available plugins...</Text>
              </Flex>
            ) : filteredMarketplacePlugins.length === 0 ? (
              <Flex direction="column" align="center" justify="center" py="8" gap="2">
                <PuzzlePieceIcon className="w-10 h-10" style={{ color: 'var(--gray-7)' }} />
                <Text size="2" color="gray">
                  {marketplaceLoaded
                    ? (marketplaceSearchQuery ? 'No plugins match your filter' : 'No desktop plugins found')
                    : 'Loading...'}
                </Text>
                {marketplaceLoaded && !marketplaceSearchQuery && (
                  <Text size="1" color="gray">Click Refresh to reload from npm</Text>
                )}
              </Flex>
            ) : (
              <Flex direction="column" gap="2">
                {filteredMarketplacePlugins.map((pkg) => {
                  const isInstalled = installedPlugins.some(p => p.id === pkg.name);
                  const isInstalling = installing === pkg.name;

                  return (
                    <div
                      key={pkg.name}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--gray-2)',
                        border: '1px solid var(--gray-5)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Flex align="center" gap="2" mb="1">
                          <Text size="1" weight="medium">{pkg.name}</Text>
                          <Badge size="1">{pkg.version}</Badge>
                          {pkg.apiquest?.type && (
                            <Badge
                              size="1"
                              color={pkg.apiquest.type === 'protocol-ui' ? 'blue' : pkg.apiquest.type === 'auth-ui' ? 'green' : 'gray'}
                            >
                              {pkg.apiquest.type}
                            </Badge>
                          )}
                        </Flex>
                        {pkg.description && (
                          <Text size="1" color="gray" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pkg.description}
                          </Text>
                        )}
                      </div>
                      {isInstalled ? (
                        <Button size="1" variant="soft" disabled>
                          <CheckCircleIcon className="w-3 h-3" />
                          Installed
                        </Button>
                      ) : (
                        <Button
                          size="1"
                          onClick={() => handleInstallPlugin(pkg.name)}
                          disabled={installing !== null && !isInstalling}
                        >
                          {isInstalling ? <Spinner size="1" /> : <ArrowDownTrayIcon className="w-3 h-3" />}
                          {isInstalling ? 'Installing...' : 'Install'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </Flex>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
