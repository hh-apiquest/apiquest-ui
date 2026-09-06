// useAutoSave - Custom hook for debounced auto-save with flush on unmount
import { useEffect, useRef, useCallback } from 'react';

interface UseAutoSaveOptions {
  onSave: () => Promise<void>;
  delay?: number; // Debounce delay in milliseconds (default: 1000ms)
  enabled?: boolean; // Whether auto-save is enabled (default: true)
}

interface UseAutoSaveResult {
  trigger: () => void;
  flush: () => Promise<void>;
  cancel: () => Promise<void>;
}

export function useAutoSave({ onSave, delay = 1000, enabled = true }: UseAutoSaveOptions): UseAutoSaveResult {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const hasPendingSaveRef = useRef(false);
  const inFlightSaveRef = useRef<Promise<void> | null>(null);
  // Always call the latest onSave without making executeSave depend on its identity.
  // Otherwise an unstable onSave re-runs the unmount-flush effect below on every render,
  // which fires the save immediately and defeats the debounce.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Clear existing timeout
  const clearTimer = useCallback((): void => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const executeSave = useCallback(async (): Promise<void> => {
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    hasPendingSaveRef.current = false;

    const savePromise = onSaveRef.current()
      .catch((error: unknown) => {
        console.error('[useAutoSave] Save failed:', error);
      })
      .finally(() => {
        isSavingRef.current = false;
        inFlightSaveRef.current = null;
      });

    inFlightSaveRef.current = savePromise;
    await savePromise;
  }, []);

  // Trigger auto-save with debounce
  const trigger = useCallback((): void => {
    if (!enabled) return;

    // Clear existing timer
    clearTimer();

    // Mark that we have a pending save
    hasPendingSaveRef.current = true;

    // Set new timer
    timeoutRef.current = setTimeout((): void => {
      void executeSave();
    }, delay);
  }, [delay, enabled, clearTimer, executeSave]);

  // Flush immediately (save now, cancel debounce)
  const flush = useCallback(async () => {
    if (!enabled) return;

    // Clear the timer
    clearTimer();

    // If there's a pending save or we're about to unmount, save now
    if (hasPendingSaveRef.current && !isSavingRef.current) {
      await executeSave();
    }
  }, [enabled, clearTimer, executeSave]);

  // Cancel pending auto-save and wait for any currently-running save.
  // Used by explicit discard flows to guarantee no late autosave writes.
  const cancel = useCallback(async (): Promise<void> => {
    clearTimer();
    hasPendingSaveRef.current = false;

    if (inFlightSaveRef.current !== null) {
      await inFlightSaveRef.current;
    }
  }, [clearTimer]);

  // Cleanup on unmount - flush pending save for normal close/navigation paths.
  // Explicit discard must call cancel() before close to avoid persisting discarded state.
  useEffect(() => {
    return () => {
      if (hasPendingSaveRef.current && !isSavingRef.current) {
        void executeSave();
      }
      clearTimer();
    };
  }, [clearTimer, executeSave]);

  return {
    trigger,  // Trigger debounced save
    flush,    // Flush immediately
    cancel,   // Cancel pending/in-flight autosave
  };
}
