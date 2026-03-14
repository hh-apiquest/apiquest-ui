import React from 'react';
import { Text, Card, Flex, Box } from '@radix-ui/themes';
import { pluginManagerService, pluginLoader } from '../../services';

export function ImporterSettings() {
  const [entries, setEntries] = React.useState<Array<{ packageName: string; plugin: any }>>([]);
  const [pluginSettings, setPluginSettings] = React.useState<Record<string, Record<string, unknown> | undefined>>({});

  const reloadEntries = React.useCallback(() => {
    setEntries(pluginManagerService.getAllImporterPluginEntries());
  }, []);

  React.useEffect(() => {
    reloadEntries();

    const onReload = () => reloadEntries();
    pluginManagerService.on('pluginsReloaded', onReload);
    pluginManagerService.on('pluginsLoaded', onReload);
    pluginManagerService.on('importerPluginRegistered', onReload);

    return () => {
      pluginManagerService.off('pluginsReloaded', onReload);
      pluginManagerService.off('pluginsLoaded', onReload);
      pluginManagerService.off('importerPluginRegistered', onReload);
    };
  }, [reloadEntries]);

  React.useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      const next: Record<string, Record<string, unknown> | undefined> = {};
      for (const entry of entries) {
        next[entry.packageName] = await pluginManagerService.getPluginSettings(entry.packageName);
      }
      if (active) {
        setPluginSettings(next);
      }
    };

    void loadSettings();
    return () => {
      active = false;
    };
  }, [entries]);

  const uiContext = pluginLoader.getUIContext();

  return (
    <Box>
      <Text size="4" weight="medium">Importer Settings</Text>
      <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
        Configure installed importer plugins. Global AI configuration is inherited and controlled in AI Settings.
      </Text>

      <Flex direction="column" gap="3" mt="4">
        {entries.length === 0 ? (
          <Card>
            <Text size="2" color="gray">No importer plugins installed.</Text>
          </Card>
        ) : entries.map(({ packageName, plugin }) => {
          const renderedSettings = plugin.renderSettings?.(
            pluginSettings[packageName],
            async (nextSettings: Record<string, unknown> | undefined) => {
              await pluginManagerService.setPluginSettings(packageName, nextSettings);
              setPluginSettings((prev) => ({ ...prev, [packageName]: nextSettings }));
            },
            uiContext
          );

          return (
            <Card key={packageName}>
              <Flex direction="column" gap="2">
                <Text size="3" weight="medium">{plugin.name}</Text>
                <Text size="1" color="gray">{packageName}</Text>
                <Text size="2" color="gray">{plugin.description}</Text>

                {renderedSettings ?? (
                  <Text size="1" color="gray">This importer has no custom settings.</Text>
                )}
              </Flex>
            </Card>
          );
        })}
      </Flex>
    </Box>
  );
}

