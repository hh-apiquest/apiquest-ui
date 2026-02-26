import React from 'react';
import { Text } from '@radix-ui/themes';
import { pluginManagerService } from '../../services/PluginManagerService';
import type { RuntimeOptions } from '@apiquest/types';

interface ProtocolOptionsSettingsProps {
  protocol: string;
  options: RuntimeOptions | undefined;
  onChange: (options: RuntimeOptions | undefined) => void;
}

export function ProtocolOptionsSettings({ 
  protocol, 
  options,
  onChange 
}: ProtocolOptionsSettingsProps) {
  
  const protocolPlugin = pluginManagerService.getProtocolPlugin(protocol);
  
  const handlePluginOptionsChange = (pluginOptions: Record<string, unknown> | undefined) => {
    const updated = { ...options };
    
    if (pluginOptions && Object.keys(pluginOptions).length > 0) {
      updated.plugins = {
        ...updated.plugins,
        [protocol]: pluginOptions
      };
    } else {
      // Remove protocol options if empty
      if (updated.plugins) {
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
  if (!protocolPlugin?.renderRuntimeOptions) {
    return (
      <div className="flex flex-col gap-2 px-2">
        <Text size="2" color="gray">
          No protocol-specific options available for {protocol.toUpperCase()}
        </Text>
      </div>
    );
  }
  
  // Use the UI context exposed by the renderer for plugin option controls.
  const uiContext = (window as any).questUIContext;
  
  return (
    <div className="flex flex-col gap-3 px-2">
      <Text size="2" weight="medium">{protocol.toUpperCase()} Protocol Options</Text>
      <div>
        {protocolPlugin.renderRuntimeOptions(
          options?.plugins?.[protocol] as Record<string, unknown> | undefined,
          handlePluginOptionsChange,
          uiContext
        )}
      </div>
    </div>
  );
}
