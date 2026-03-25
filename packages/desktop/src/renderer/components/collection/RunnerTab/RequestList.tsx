// RequestList - Selectable tree of requests and folders for collection runner
import { useState, type JSX } from 'react';
import { Checkbox } from '@radix-ui/themes';
import { ChevronDownIcon, ChevronRightIcon, FolderIcon } from '@heroicons/react/24/outline';
import { RequestMetadataIcons } from '../../shared/RequestMetadataIcons';
import type { RunnerCollection, RunnerCollectionItem } from '../../../types/runner-tab';

type FolderCounts = {
  total: number;
  selected: number;
};

function isFolderItem(item: RunnerCollectionItem): item is Extract<RunnerCollectionItem, { type: 'folder' }> {
  return item.type === 'folder';
}

function sortCollectionItems(a: RunnerCollectionItem, b: RunnerCollectionItem): number {
  const aIsFolder = isFolderItem(a);
  const bIsFolder = isFolderItem(b);

  if (aIsFolder && !bIsFolder) {
    return -1;
  }

  if (!aIsFolder && bIsFolder) {
    return 1;
  }

  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

interface RequestListProps {
  collection: RunnerCollection;
  selectedRequests: string[];
  onSelectionChange: (selected: string[]) => void;
  isRunning: boolean;
}

export function RequestList({ collection, selectedRequests, onSelectionChange, isRunning }: RequestListProps): JSX.Element {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Get all request IDs from collection (recursive)
  const getAllRequestIds = (items: RunnerCollectionItem[]): string[] => {
    const ids: string[] = [];

    for (const item of items) {
      if (isFolderItem(item)) {
        ids.push(...getAllRequestIds(item.items));
      } else {
        ids.push(item.id);
      }
    }

    return ids;
  };

  const allRequestIds = getAllRequestIds(collection.items);
  const allSelected = allRequestIds.length > 0 && allRequestIds.every((id) => selectedRequests.includes(id));
  const someSelected = selectedRequests.length > 0 && selectedRequests.length < allRequestIds.length;

  const toggleSelectAll = (): void => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(allRequestIds);
    }
  };

  const toggleRequest = (requestId: string): void => {
    if (selectedRequests.includes(requestId)) {
      onSelectionChange(selectedRequests.filter((id) => id !== requestId));
    } else {
      onSelectionChange([...selectedRequests, requestId]);
    }
  };

  const toggleFolder = (folderId: string): void => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  // Get counts for folder (including nested folders)
  const getFolderCounts = (items: RunnerCollectionItem[]): FolderCounts => {
    let total = 0;
    let selected = 0;
    
    for (const item of items) {
      if (isFolderItem(item)) {
        const counts = getFolderCounts(item.items);
        total += counts.total;
        selected += counts.selected;
      } else {
        total++;
        if (selectedRequests.includes(item.id)) {
          selected++;
        }
      }
    }
    
    return { total, selected };
  };

  const renderItem = (item: RunnerCollectionItem, level = 0): JSX.Element => {
    const isExpanded = expandedFolders.has(item.id);
    const isSelected = selectedRequests.includes(item.id);

    if (isFolderItem(item)) {
      const folderCounts = getFolderCounts(item.items);
      
      return (
        <div key={item.id} style={{ marginLeft: `${level * 16}px` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--gray-3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <button
              onClick={() => toggleFolder(item.id)}
              style={{
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--gray-10)'
              }}
            >
              {isExpanded ? (
                <ChevronDownIcon className="w-4 h-4" />
              ) : (
                <ChevronRightIcon className="w-4 h-4" />
              )}
            </button>
            <FolderIcon className="w-4 h-4" style={{ color: 'var(--gray-10)' }} />
            <span style={{ flex: 1 }}>{item.name}</span>
            <span style={{
              fontSize: '11px',
              color: folderCounts.selected === folderCounts.total ? 'var(--green-9)' : 'var(--orange-9)',
              fontWeight: 500
            }}>
              {folderCounts.selected}/{folderCounts.total}
            </span>
          </div>
          {isExpanded && (
            <div>
              {[...item.items]
                .sort(sortCollectionItems)
                .map((subItem) => renderItem(subItem, level + 1))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        key={item.id}
        style={{
          marginLeft: `${level * 16}px`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 8px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '13px'
        }}
        onClick={() => !isRunning && toggleRequest(item.id)}
        onMouseEnter={(e) => {
          if (!isRunning) e.currentTarget.style.backgroundColor = 'var(--gray-3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => !isRunning && toggleRequest(item.id)}
          disabled={isRunning}
          onClick={(e) => e.stopPropagation()}
        />
        <span style={{ flex: 1 }}>{item.name}</span>
        <RequestMetadataIcons resource={item} />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--gray-6)', borderRadius: '8px', padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--gray-6)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Requests</h3>
        <button
          onClick={toggleSelectAll}
          disabled={isRunning}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 500,
            borderRadius: '4px',
            border: '1px solid var(--gray-6)',
            backgroundColor: 'var(--gray-2)',
            color: 'var(--gray-12)',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.5 : 1
          }}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {collection.items.length > 0 ? (
          [...collection.items]
            .sort(sortCollectionItems)
            .map((item) => renderItem(item))
        ) : (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--gray-9)', fontSize: '13px' }}>
            No requests in this collection
          </div>
        )}
      </div>

      {selectedRequests.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--gray-10)', paddingTop: '8px', borderTop: '1px solid var(--gray-6)' }}>
          {selectedRequests.length} of {allRequestIds.length} request{allRequestIds.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}
