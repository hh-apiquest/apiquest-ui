import React from 'react';
import { Text } from '@radix-ui/themes';
import { pluginManagerService } from '../../services/PluginManagerService';
import { pluginLoader } from '../../services';
import type { RuntimeOptions } from '@apiquest/types';
import type { PluginUIContext } from '@apiquest/plugin-ui-types';

interface ProtocolOptionsSettingsProps {
  protocol: string;
  options: RuntimeOptions | undefined;
  onChange: (options: RuntimeOptions | undefined) => void;
}

export function ProtocolOptionsSettings({ 
  protocol, 
  options,
  onChange 
}: ProtocolOptionsSettingsProps): React.ReactElement {
  
  const protocolPlugin = pluginManagerService.getProtocolPlugin(protocol);
  
  const handlePluginOptionsChange = (pluginOptions: Record<string, unknown> | undefined): void => {
    const updated = { ...options };
    
    if (pluginOptions !== undefined && Object.keys(pluginOptions).length > 0) {
      updated.plugins = {
        ...updated.plugins,
        [protocol]: pluginOptions
      };
    } else {
      // Remove protocol options if empty
      if (updated.plugins !== undefined) {
        const plugins = { ...updated.plugins };
        delete plugins[protocol];
        updated.plugins = Object.keys(plugins).length > 0 ? plugins : undefined;
      }
    }
    
    // Clean up empty objects
    if (updated.plugins === undefined && Object.keys(updated).length === 0) {
      onChange(undefined);
    } else {
      onChange(updated);
    }
  };
  
  // If plugin doesn't provide renderRuntimeOptions, show nothing
  if (protocolPlugin?.renderRuntimeOptions === undefined) {
    return (
      <div className="flex flex-col gap-2 px-2">
        <Text size="2" color="gray">
          No protocol-specific options available for {protocol.toUpperCase()}
        </Text>
      </div>
    );
  }
  
  // Use the UI context exposed by the renderer for plugin option controls.
  const uiContext: PluginUIContext = pluginLoader.getUIContext(protocol);
  const pluginOptions = options?.plugins?.[protocol];
  
  return (
    <div className="flex flex-col gap-3 px-2">
      <Text size="2" weight="medium">{protocol.toUpperCase()} Protocol Options</Text>
      <div>
        {protocolPlugin.renderRuntimeOptions(
          typeof pluginOptions === 'object' && pluginOptions !== null ? pluginOptions as Record<string, unknown> : undefined,
          handlePluginOptionsChange,
          uiContext
        )}
      </div>
    </div>
  );
}
