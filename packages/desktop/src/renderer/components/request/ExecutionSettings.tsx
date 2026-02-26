import React from 'react';
import { Square3Stack3DIcon, BoltIcon, XMarkIcon, MagnifyingGlassIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import type { CollectionItem, Collection } from '@apiquest/types';
import { TextField, Dialog, Button, Text, Badge, IconButton, Code, Popover } from '@radix-ui/themes';

interface ExecutionSettingsProps {
  resource: CollectionItem;
  onChange: (resource: CollectionItem) => void;
  allItems: Array<{ id: string; name: string; type: 'folder' | 'request' }>;
  currentItemId: string;
  collection?: Collection;
}

// Helper function to get all ancestors of an item
function getAncestors(itemId: string, collection: Collection | undefined): string[] {
  if (!collection || !collection.items) return [];
  
  const ancestors: string[] = [];
  
  function findParent(items: CollectionItem[], targetId: string, currentPath: string[]): boolean {
    for (const item of items) {
      if (item.id === targetId) {
        ancestors.push(...currentPath);
        return true;
      }
      if (item.type === 'folder') {
        if (findParent(item.items, targetId, [...currentPath, item.id])) {
          return true;
        }
      }
    }
    return false;
  }
  
  findParent(collection.items, itemId, []);
  return ancestors;
}

// Helper function to get all descendants of an item
function getDescendants(itemId: string, collection: Collection | undefined): string[] {
  if (!collection || !collection.items) return [];
  
  const descendants: string[] = [];
  
  function findItemAndCollectDescendants(items: CollectionItem[]): CollectionItem | null {
    for (const item of items) {
      if (item.id === itemId) {
        return item;
      }
      if (item.type === 'folder') {
        const found = findItemAndCollectDescendants(item.items);
        if (found) return found;
      }
    }
    return null;
  }
  
  function collectDescendants(item: CollectionItem) {
    if (item.type === 'folder') {
      for (const child of item.items) {
        descendants.push(child.id);
        collectDescendants(child);
      }
    }
  }
  
  const item = findItemAndCollectDescendants(collection.items);
  if (item) {
    collectDescendants(item);
  }
  
  return descendants;
}

export function ExecutionSettings({ resource, onChange, allItems, currentItemId, collection }: ExecutionSettingsProps) {
  
  const [localDependencies, setLocalDependencies] = React.useState<string[]>(resource.dependsOn || []);
  const [localCondition, setLocalCondition] = React.useState<string>(resource.condition || '');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Filter out current item, ancestors, and descendants to prevent cycles
  const availableItems = React.useMemo(
    () => {
      const excludedIds = [
        currentItemId,
        ...getAncestors(currentItemId, collection),
        ...getDescendants(currentItemId, collection)
      ];
      return allItems.filter(item => !excludedIds.includes(item.id));
    },
    [allItems, currentItemId, collection]
  );

  // Filter items based on search query
  const filteredItems = React.useMemo(
    () => {
      if (!searchQuery.trim()) return availableItems;
      const query = searchQuery.toLowerCase();
      return availableItems.filter(item => 
        item.name.toLowerCase().includes(query) || 
        item.id.toLowerCase().includes(query)
      );
    },
    [availableItems, searchQuery]
  );

  // Get item name by ID
  const getItemNameById = (id: string): string => {
    return allItems.find(item => item.id === id)?.name || id;
  };

  const handleAddDependency = (itemId: string) => {
    if (localDependencies.includes(itemId)) return;
    
    const newDependencies = [...localDependencies, itemId];
    setLocalDependencies(newDependencies);
    onChange({
      ...resource,
      dependsOn: newDependencies.length > 0 ? newDependencies : undefined
    });
    setIsModalOpen(false);
    setSearchQuery('');
  };

  const handleRemoveDependency = (itemId: string) => {
    const newDependencies = localDependencies.filter(id => id !== itemId);
    setLocalDependencies(newDependencies);
    onChange({
      ...resource,
      dependsOn: newDependencies.length > 0 ? newDependencies : undefined
    });
  };

  const handleConditionChange = (value: string) => {
    setLocalCondition(value);
    onChange({
      ...resource,
      condition: value.trim() ? value : undefined
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Dependencies Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Square3Stack3DIcon className="w-4 h-4" style={{ color: 'var(--accent-9)' }} />
          <Text size="2" weight="medium">Dependencies</Text>
        </div>
        
        <Text size="1" color="gray">
          {resource.type === 'folder' ? 'Folders/requests that must complete before this folder runs.' : 'Requests/folders that must complete before this request runs.'}
        </Text>

        {/* Selected Dependencies as chips */}
        <div 
          className="min-h-[34px] p-2 rounded flex flex-wrap gap-1.5 items-center cursor-text"
          style={{ 
            border: '1px solid var(--gray-7)',
            background: 'var(--gray-2)'
          }}
          onClick={() => setIsModalOpen(true)}
        >
          {localDependencies.map(depId => (
            <Badge
              key={depId}
              variant="soft"
              color="blue"
              size="1"
              style={{ paddingRight: '2px' }}
            >
              <Text size="1">{getItemNameById(depId)}</Text>
              <IconButton
                size="1"
                variant="ghost"
                color="blue"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveDependency(depId);
                }}
                style={{ marginLeft: '2px', width: '16px', height: '16px' }}
              >
                <XMarkIcon className="w-3 h-3" />
              </IconButton>
            </Badge>
          ))}
          
          {localDependencies.length === 0 && (
            <Text size="2" color="gray">
              Click to add dependencies...
            </Text>
          )}
          
          <MagnifyingGlassIcon 
            className="w-4 h-4 ml-auto" 
            style={{ color: 'var(--gray-9)' }} 
          />
        </div>

        {/* Selection Modal */}
        <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
          <Dialog.Content style={{ maxWidth: 500 }}>
            <Dialog.Title>Select Dependency</Dialog.Title>
            <Dialog.Description size="2" mb="4">
              Choose which {resource.type === 'folder' ? 'folder or request' : 'request or folder'} must complete before this {resource.type} runs.
            </Dialog.Description>

            <div className="flex flex-col gap-3">
              <TextField.Root
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="2"
              >
                <TextField.Slot>
                  <MagnifyingGlassIcon height="16" width="16" />
                </TextField.Slot>
              </TextField.Root>

              <div 
                className="flex flex-col gap-1 max-h-96 overflow-y-auto p-2 rounded"
                style={{ 
                  background: 'var(--gray-2)',
                  border: '1px solid var(--gray-6)'
                }}
              >
                {availableItems.length === 0 ? (
                  <Text size="2" color="gray" align="center" style={{ padding: '16px' }}>
                    No other items available in this collection
                  </Text>
                ) : filteredItems.length === 0 ? (
                  <Text size="2" color="gray" align="center" style={{ padding: '16px' }}>
                    No items found matching "{searchQuery}"
                  </Text>
                ) : (
                  filteredItems.map(item => {
                    const isSelected = localDependencies.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleAddDependency(item.id)}
                        disabled={isSelected}
                        className="flex items-center justify-between p-2 rounded text-left hover:bg-gray-3"
                        style={{
                          border: 'none',
                          background: isSelected ? 'var(--accent-3)' : 'transparent',
                          cursor: isSelected ? 'default' : 'pointer',
                          opacity: isSelected ? 0.5 : 1
                        }}
                      >
                        <div className="flex flex-col gap-0.5 flex-1">
                          <div className="flex items-center gap-2">
                            <Text size="2" weight="medium">{item.name}</Text>
                            <Badge color={item.type === 'folder' ? 'purple' : 'blue'} variant="soft" size="1">
                              {item.type}
                            </Badge>
                          </div>
                          <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                            {item.id}
                          </Text>
                        </div>
                        {isSelected && (
                          <Badge color="blue" variant="soft" size="1">
                            Selected
                          </Badge>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-4">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Close
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      </div>

      {/* Condition Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BoltIcon className="w-4 h-4" style={{ color: 'var(--accent-9)' }} />
          <Text size="2" weight="medium">Execution Condition</Text>
        </div>
        
        <div className="flex items-center gap-2">
          <Text size="1" color="gray" style={{ flex: 1 }}>
            JavaScript expression to control if this {resource.type} executes.
          </Text>
          <Popover.Root>
            <Popover.Trigger>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                style={{ cursor: 'help' }}
              >
                <InformationCircleIcon height="16" width="16" />
              </IconButton>
            </Popover.Trigger>
            <Popover.Content style={{ width: 350 }}>
              <div className="flex flex-col gap-2">
                <Text size="2" weight="bold">Examples:</Text>
                <Code size="1">quest.variables.get('env') === 'production'</Code>
                <Code size="1">quest.iteration.count &gt; 1</Code>
                <Code size="1">quest.globals.get('skipTests') !== 'true'</Code>
              </div>
            </Popover.Content>
          </Popover.Root>
        </div>

        <TextField.Root
          value={localCondition}
          onChange={(e) => handleConditionChange(e.target.value)}
          placeholder="e.g., quest.variables.get('env') === 'production'"
          size="2"
          style={{
            fontFamily: 'monospace'
          }}
        />

        {localCondition && (
          <div
            className="text-xs p-2 rounded flex items-start gap-2"
            style={{
              background: 'var(--amber-3)',
              borderLeft: '3px solid var(--amber-9)'
            }}
          >
            <Text size="1" style={{ color: 'var(--amber-11)' }}>
              ⚠ Evaluated at runtime. Ensure valid JavaScript expression.
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
