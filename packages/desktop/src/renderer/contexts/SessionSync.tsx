// SessionSync - Connects WorkspaceContext and TabContext for session persistence
import { useEffect, useRef, type ReactElement } from 'react';
import { useWorkspace } from './WorkspaceContext';
import { useTabNavigation } from './TabContext';

export function SessionSync(): ReactElement | null {
  const { workspace } = useWorkspace();
  const { loadSession } = useTabNavigation();
  const previousIdRef = useRef<string | null>(null);

  // Load session when workspace changes
  useEffect((): void => {
    const workspaceId = workspace?.id;

    // Only load session if workspace ID actually changed
    if (workspaceId !== undefined && workspaceId !== '' && workspaceId !== previousIdRef.current) {
      console.log('SessionSync: Loading session for workspace:', workspaceId);
      void loadSession(workspaceId);
      previousIdRef.current = workspaceId;
    }
  }, [workspace?.id, loadSession]);

  return null; // This component doesn't render anything
}
