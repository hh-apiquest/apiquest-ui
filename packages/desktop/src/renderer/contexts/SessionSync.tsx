// SessionSync - Connects WorkspaceContext and TabContext for session persistence
import { useEffect, useRef } from 'react';
import { useWorkspace } from './WorkspaceContext';
import { useTabNavigation } from './TabContext';

export function SessionSync() {
  const { workspace } = useWorkspace();
  const { loadSession } = useTabNavigation();
  const previousIdRef = useRef<string | null>(null);

  // Load session when workspace changes
  useEffect(() => {
    // Only load session if workspace ID actually changed
    if (workspace?.id && workspace.id !== previousIdRef.current) {
      console.log('SessionSync: Loading session for workspace:', workspace.id);
      loadSession(workspace.id);
      previousIdRef.current = workspace.id;
    }
  }, [workspace?.id, loadSession]);

  return null; // This component doesn't render anything
}
