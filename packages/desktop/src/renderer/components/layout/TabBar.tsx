// TabBar - Shows open request tabs with close buttons
import { useState, useRef, useEffect, type ReactElement } from 'react';
import { useTabNavigation, useTabStatusState, useTabEditorBridge, useWorkspace } from '../../contexts';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Badge } from '@radix-ui/themes';
import { RectangleStackIcon, FolderIcon, ChevronLeftIcon, ChevronRightIcon, DocumentArrowDownIcon, ArrowPathIcon, CheckCircleIcon, XCircleIcon, PlayIcon } from '@heroicons/react/24/outline';
import type { RunnerMetadata, RequestMetadata, Tab } from '../../contexts/TabContext';

function isRequestMetadata(metadata: Tab['metadata']): metadata is RequestMetadata {
  return metadata !== undefined && metadata !== null && !('runId' in metadata);
}

function isRunnerMetadata(metadata: Tab['metadata']): metadata is RunnerMetadata {
  return metadata !== undefined && metadata !== null && 'runId' in metadata;
}

export function TabBar(): ReactElement {
  const { tabs, activeTabId, setActiveTab, closeTab, clearTemporaryFlag, clearResourceState } = useTabNavigation();
  const { workspace } = useWorkspace();
  const { status } = useTabStatusState();
  const { invokeSaveHandler, invokeDiscardHandler, invokeFlushHandler } = useTabEditorBridge();

  const [closeDialogTabId, setCloseDialogTabId] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tabRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const previousTabsLengthRef = useRef(tabs.length);

  const updateScrollButtons = (): void => {
    if (scrollContainerRef.current === null) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    if (tabs.length > previousTabsLengthRef.current && scrollContainerRef.current !== null) {
      scrollContainerRef.current.scrollTo({
        left: scrollContainerRef.current.scrollWidth,
        behavior: 'smooth'
      });
    }
    previousTabsLengthRef.current = tabs.length;
    updateScrollButtons();
  }, [tabs.length]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container === null) return;
    
    updateScrollButtons();
    container.addEventListener('scroll', updateScrollButtons);
    
    return () => {
      container.removeEventListener('scroll', updateScrollButtons);
    };
  }, [tabs]);

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (activeTabId === null || scrollContainerRef.current === null) return;
    
    const activeTabElement = tabRefsRef.current.get(activeTabId);
    if (activeTabElement === undefined) return;
    
    activeTabElement.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }, [activeTabId]);

  const scrollLeft = (): void => {
    if (scrollContainerRef.current === null) return;
    scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
  };

  const scrollRight = (): void => {
    if (scrollContainerRef.current === null) return;
    scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
  };

  const handleSave = async (): Promise<void> => {
    if (activeTabId === null || isSaving) return;
    
    setIsSaving(true);
    try {
      await invokeSaveHandler(activeTabId);
    } catch (error: unknown) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Add Ctrl+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTabId, isSaving, invokeSaveHandler]);

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? null;
  const isActiveTabDirty = activeTabId !== null ? status.isDirtyByTabId[activeTabId] === true : false;

  if (tabs.length === 0) {
    return (
      <div className="flex items-center px-2 border-b" style={{ height: 30, background: 'var(--gray-2)', borderColor: 'var(--gray-6)' }}>
        <div className="text-xs" style={{ color: 'var(--gray-9)' }}>No tabs open</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {closeDialogTabId !== null && (() => {
        const tab = tabs.find(t => t.id === closeDialogTabId);
        if (tab === undefined) return null;

        const isDirty = status.isDirtyByTabId[tab.id] === true;
        const name = status.nameByTabId[tab.id] !== '' ? status.nameByTabId[tab.id] : tab.name;

        return (
          <ConfirmDialog
            open={closeDialogTabId !== null}
            onOpenChange={(open) => {
              if (!open) setCloseDialogTabId(null);
            }}
            title="Unsaved changes"
            description={`"${name}" has unsaved changes. What would you like to do?`}
            confirmLabel={isClosing ? 'Saving…' : 'Save'}
            cancelLabel="Cancel"
            onConfirm={() => {
              void (async () => {
                setIsClosing(true);
                try {
                  await invokeSaveHandler(tab.id);
                  closeTab(tab.id);
                } finally {
                  setIsClosing(false);
                }
              })();
            }}
            onDiscard={async () => {
              await invokeDiscardHandler(tab.id);
              // Close first so editor unmounts immediately and no further triggers can be queued.
              closeTab(tab.id);
              if (workspace !== null) {
                await clearResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`);
              }
            }}
            discardLabel="Discard"
            discardVariant="danger"
            variant="default"
          />
        );
      })()}

      <div className="flex items-center border-b" style={{ height: 30, background: 'var(--gray-2)', borderColor: 'var(--gray-6)' }}>
        <button
          onClick={scrollLeft}
          disabled={!canScrollLeft}
          className="border-none bg-transparent cursor-pointer px-1 h-full"
          style={{
            flexShrink: 0,
            cursor: canScrollLeft ? 'pointer' : 'not-allowed',
            opacity: canScrollLeft ? 1 : 0.3
          }}
          title="Scroll left"
        >
          <ChevronLeftIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
        </button>

        <div
          ref={scrollContainerRef}
          className="hide-scrollbar flex items-center flex-1"
          style={{ gap: '2px', padding: '0 2px', overflowX: 'auto', scrollBehavior: 'smooth', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isDirty = status.isDirtyByTabId[tab.id] === true;
        const statusName = status.nameByTabId[tab.id];
        const label = statusName !== '' ? statusName : tab.name;
        
        let icon: ReactElement | null = null;
        
        if (tab.type === 'request') {
          const reqMetadata = isRequestMetadata(tab.metadata) ? tab.metadata : undefined;
          const badge = status.badgeByTabId[tab.id] ?? reqMetadata?.badge;
          if (badge !== undefined) {
            icon = <Badge color={badge.color as never} size="1" style={{ fontSize: '10px', fontWeight: 700 }}>{badge.primary}</Badge>;
          } else {
            icon = <Badge color="gray" size="1" style={{ fontSize: '10px', fontWeight: 700 }}>REQ</Badge>;
          }
        } else if (tab.type === 'collection') {
          icon = <RectangleStackIcon className="w-4 h-4" style={{ color: 'var(--accent-9)' }} />;
        } else if (tab.type === 'folder') {
          icon = <FolderIcon className="w-4 h-4" style={{ color: 'var(--accent-9)' }} />;
        } else if (tab.type === 'runner') {
          const meta = isRunnerMetadata(tab.metadata) ? tab.metadata : null;
          // Show status icon
          icon = meta?.status === 'running' ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin" style={{ color: 'var(--blue-9)' }} />
          ) : meta?.status === 'completed' ? (
            <CheckCircleIcon className="w-4 h-4" style={{ color: 'var(--green-9)' }} />
          ) : meta?.status === 'error' ? (
            <XCircleIcon className="w-4 h-4" style={{ color: 'var(--red-9)' }} />
          ) : (
            <PlayIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
          );
        }

        let tooltip = label;
        if (tab.type === 'request' && isRequestMetadata(tab.metadata)) {
          const reqMetadata = tab.metadata;
          const parts: string[] = [];
          if (reqMetadata.badge !== undefined) {
            parts.push(reqMetadata.badge.primary);
            if (reqMetadata.badge.secondary !== undefined && reqMetadata.badge.secondary !== '') parts.push(reqMetadata.badge.secondary);
          }
          parts.push(label);
          if (reqMetadata.description !== undefined && reqMetadata.description !== '') parts.push(reqMetadata.description);
          tooltip = parts.join(' - ');
        }

        return (
          <div
            key={tab.id}
            ref={(el) => {
              if (el !== null) {
                tabRefsRef.current.set(tab.id, el);
              } else {
                tabRefsRef.current.delete(tab.id);
              }
            }}
            className="flex items-center cursor-pointer text-xs"
            style={{
              gap: '4px',
              padding: '4px 8px',
              borderTopLeftRadius: '4px',
              borderTopRightRadius: '4px',
              background: isActive ? 'var(--color-background)' : 'var(--gray-3)',
              borderTop: isActive ? '2px solid var(--accent-9)' : 'none'
            }}
            onClick={() => {
              if (tab.id === activeTabId) return;
              // Flush any pending debounced auto-save on the current tab before
              // switching so the session state is up-to-date when the new tab
              // mounts and reads it. invokeFlushHandler is a no-op when there is
              // no pending save (hasPendingSaveRef.current is false).
              if (activeTabId !== null) {
                void invokeFlushHandler(activeTabId).then(() => {
                  setActiveTab(tab.id);
                  if (tab.isTemporary === true) {
                    clearTemporaryFlag(tab.id);
                  }
                });
              } else {
                setActiveTab(tab.id);
                if (tab.isTemporary === true) {
                  clearTemporaryFlag(tab.id);
                }
              }
            }}
            title={tooltip}
          >
            {icon}
            <span className="truncate" style={{ maxWidth: '120px', fontStyle: tab.isTemporary === true ? 'italic' : 'normal' }}>{label}</span>
            {isDirty && <span className="text-xxs" style={{ color: 'var(--accent-9)' }}>●</span>}
            <button
              className="border-none bg-transparent cursor-pointer"
              style={{
                marginLeft: '4px',
                padding: '0 4px',
                borderRadius: '2px',
                color: 'var(--gray-9)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isDirty) {
                  setCloseDialogTabId(tab.id);
                } else {
                  closeTab(tab.id);
                }
              }}
            >
              ×
            </button>
          </div>
          );
        })}
        </div>

        <button
          onClick={scrollRight}
          disabled={!canScrollRight}
          className="border-none bg-transparent cursor-pointer px-1 h-full"
          style={{
            flexShrink: 0,
            cursor: canScrollRight ? 'pointer' : 'not-allowed',
            opacity: canScrollRight ? 1 : 0.3
          }}
          title="Scroll right"
        >
          <ChevronRightIcon className="w-4 h-4" style={{ color: 'var(--gray-9)' }} />
        </button>

        <button
          onClick={() => { void handleSave(); }}
          disabled={!isActiveTabDirty || isSaving}
          className="border-none bg-transparent h-full px-2 border-l"
          style={{
            flexShrink: 0,
            borderColor: 'var(--gray-6)',
            cursor: (isActiveTabDirty && !isSaving) ? 'pointer' : 'not-allowed',
            opacity: (isActiveTabDirty && !isSaving) ? 1 : 0.3,
            color: (isActiveTabDirty && !isSaving) ? 'var(--accent-9)' : 'var(--gray-9)'
          }}
          title={isActiveTabDirty ? 'Save changes' : 'No changes to save'}
        >
          <DocumentArrowDownIcon className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}
