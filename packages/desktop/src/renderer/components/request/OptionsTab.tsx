import React from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { ExecutionSettings } from './ExecutionSettings';
import { RuntimeOptionsSettings } from './RuntimeOptionsSettings';
import { ProtocolOptionsSettings } from './ProtocolOptionsSettings';
import { Text } from '@radix-ui/themes';
import * as Collapsible from '@radix-ui/react-collapsible';
import type { Collection, CollectionItem, RuntimeOptions } from '@apiquest/types';
import type { PluginUIContext, ReactiveUIState } from '@apiquest/plugin-ui-types';

type OptionableResource = CollectionItem | Collection;

function isCollectionItemResource(resource: OptionableResource): resource is CollectionItem {
  return 'type' in resource;
}

interface OptionsTabProps<TResource extends OptionableResource> {
  resource: TResource;
  onChange: (updated: TResource) => void;
  uiContext: PluginUIContext;
  uiState?: ReactiveUIState;
  allItems?: Array<{ id: string; name: string; type: 'folder' | 'request' }>; // For dependencies
  currentItemId?: string; // For dependencies
  resourceType?: 'request' | 'folder' | 'collection';
  collection?: Collection;
}

export function OptionsTab<TResource extends OptionableResource>({ resource, onChange, uiContext, uiState, allItems = [], currentItemId = '', resourceType = 'request', collection }: OptionsTabProps<TResource>): React.ReactElement {
  // Get runtime options from resource (all types have this per schema)
  const options: RuntimeOptions = resource.options ?? {};
  const handleCollectionItemChange = (updated: CollectionItem): void => {
    onChange(updated as TResource);
  };
  
  const [executionExpanded, setExecutionExpanded] = React.useState(true);
  const [protocolExpanded, setProtocolExpanded] = React.useState(false);
  const [runtimeExpanded, setRuntimeExpanded] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* Execution Settings Section - Now for both folders and requests */}
      <Collapsible.Root open={executionExpanded} onOpenChange={setExecutionExpanded}>
        <Collapsible.Trigger asChild>
          <button 
            className="flex items-center justify-between py-3 border-b cursor-pointer hover:bg-gray-2 px-2 w-full"
            style={{ 
              borderColor: 'var(--gray-6)',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--gray-6)'
            }}
          >
            <Text size="2" weight="medium">Execution Control</Text>
            {executionExpanded ? (
              <ChevronUpIcon className="w-4 h-4" style={{ color: 'var(--gray-11)' }} />
            ) : (
              <ChevronDownIcon className="w-4 h-4" style={{ color: 'var(--gray-11)' }} />
            )}
          </button>
        </Collapsible.Trigger>
        
        <Collapsible.Content>
          <div className="pt-4">
            {isCollectionItemResource(resource) ? (
              <ExecutionSettings
                resource={resource}
                onChange={handleCollectionItemChange}
                allItems={allItems}
                currentItemId={currentItemId}
                collection={collection}
              />
            ) : (
              <Text size="2" color="gray">Execution control is only available for folders and requests.</Text>
            )}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Protocol-specific Options Section */}
      {collection?.protocol !== undefined && collection.protocol !== '' && (
        <Collapsible.Root open={protocolExpanded} onOpenChange={setProtocolExpanded}>
          <Collapsible.Trigger asChild>
            <button
              className="flex items-center justify-between py-3 border-b cursor-pointer hover:bg-gray-2 px-2 w-full"
              style={{
                borderColor: 'var(--gray-6)',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--gray-6)'
              }}
            >
              <Text size="2" weight="medium">Protocol Options ({collection.protocol.toUpperCase()})</Text>
              {protocolExpanded ? (
                <ChevronUpIcon className="w-4 h-4" style={{ color: 'var(--gray-11)' }} />
              ) : (
                <ChevronDownIcon className="w-4 h-4" style={{ color: 'var(--gray-11)' }} />
              )}
            </button>
          </Collapsible.Trigger>
          
          <Collapsible.Content>
            <div className="pt-4">
              <ProtocolOptionsSettings
                protocol={collection.protocol}
                options={resource.options}
                onChange={(options) => onChange({ ...resource, options })}
              />
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      )}

      {/* Runtime Options Section */}
      <Collapsible.Root open={runtimeExpanded} onOpenChange={setRuntimeExpanded}>
        <Collapsible.Trigger asChild>
          <button
            className="flex items-center justify-between py-3 border-b cursor-pointer hover:bg-gray-2 px-2 w-full"
            style={{ 
              borderColor: 'var(--gray-6)',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--gray-6)'
            }}
          >
            <Text size="2" weight="medium">Runtime Options</Text>
            {runtimeExpanded ? (
              <ChevronUpIcon className="w-4 h-4" style={{ color: 'var(--gray-11)' }} />
            ) : (
              <ChevronDownIcon className="w-4 h-4" style={{ color: 'var(--gray-11)' }} />
            )}
          </button>
        </Collapsible.Trigger>
        
        <Collapsible.Content>
          <div className="pt-4">
            <RuntimeOptionsSettings
              options={resource.options}
              onChange={(options) => onChange({ ...resource, options })}
              protocol={collection?.protocol}
              resourceType={resourceType}
            />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}
