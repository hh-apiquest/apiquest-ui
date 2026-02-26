// MainLayout - Compact three-panel layout
import { useRef, useState } from 'react';
import { useTheme, useScreenMode } from '../../contexts';
import { useTabNavigation } from '../../contexts/TabContext';
import { AppBar } from './AppBar';
import { Sidebar } from './Sidebar';
import { ConsolePanel } from './ConsolePanel';
import { TabBar } from './TabBar';
import { RequestEditor } from '../request';
import { CollectionEditor } from '../collection/CollectionEditor';
import { FolderEditor } from '../folder/FolderEditor';
import { RunnerExecution } from '../runner/RunnerExecution';
import { WorkspaceManager } from '../workspace';
import { SettingsPanel } from '../settings/SettingsPanel';

export function MainLayout() {
  const { actualTheme } = useTheme();
  const { tabs, getActiveTab } = useTabNavigation();
  const { mode } = useScreenMode();
  const [isConsoleMinimized, setIsConsoleMinimized] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [consoleHeight, setConsoleHeight] = useState(240);
  const rootRef = useRef<HTMLDivElement | null>(null);
  
  const activeTab = getActiveTab();

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const next = clamp(startWidth + delta, 200, 700);
      setSidebarWidth(next);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startConsoleResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rootRect = rootRef.current?.getBoundingClientRect();
    if (!rootRect) return;

    const onMove = (ev: PointerEvent) => {
      const nextHeight = clamp(rootRect.bottom - ev.clientY, 120, Math.max(120, rootRect.height - 150));
      setConsoleHeight(nextHeight);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <AppBar />

      <div ref={rootRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {mode === 'request-editor' ? (
          <>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <aside style={{ height: '100%', borderRight: '1px solid var(--gray-6)', display: 'flex', flexDirection: 'column', overflow: 'hidden', width: sidebarWidth }}>
                <Sidebar />
              </aside>

              <div
                className="resize-bar"
                onPointerDown={startSidebarResize}
                style={{ width:'1px', cursor: 'ew-resize', WebkitAppRegion: 'no-drag' } as any}
              />

              <main style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <TabBar />
                {activeTab ? (
                  activeTab.type === 'request' ? (
                    <RequestEditor tab={activeTab} />
                  ) : activeTab.type === 'collection' ? (
                    <CollectionEditor tab={activeTab} />
                  ) : activeTab.type === 'folder' ? (
                    <FolderEditor tab={activeTab} />
                  ) : activeTab.type === 'runner' ? (
                    <RunnerExecution tab={activeTab} />
                  ) : null
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-9)' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>Nothing selected</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>Click an item in the sidebar to open it</div>
                    </div>
                  </div>
                )}
              </main>
            </div>

            {!isConsoleMinimized && (
              <div
                className="resize-bar"
                onPointerDown={startConsoleResize}
                style={{ height:'1px', cursor: 'ns-resize', WebkitAppRegion: 'no-drag' } as any}
              />
            )}

            <div style={{ borderTop: '1px solid var(--gray-6)', overflow: 'hidden', height: isConsoleMinimized ? 32 : consoleHeight }}>
              <ConsolePanel
                isMinimized={isConsoleMinimized}
                onToggleMinimize={() => setIsConsoleMinimized(!isConsoleMinimized)}
              />
            </div>
          </>
        ) : mode === 'workspace-manager' ? (
          <WorkspaceManager />
        ) : mode === 'settings' ? (
          <SettingsPanel />
        ) : null}
      </div>
    </div>
  );
}
