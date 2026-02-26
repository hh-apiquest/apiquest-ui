// useAutoSave - Custom hook for debounced auto-save with flush on unmount
import { useEffect, useRef, useCallback } from 'react';

interface UseAutoSaveOptions {
  onSave: () => Promise<void>;
  delay?: number; // Debounce delay in milliseconds (default: 2000ms)
  enabled?: boolean; // Whether auto-save is enabled (default: true)
}

export function useAutoSave({ onSave, delay = 2000, enabled = true }: UseAutoSaveOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const hasPendingSaveRef = useRef(false);

  // Clear existing timeout
  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Trigger auto-save with debounce
  const trigger = useCallback(() => {
    if (!enabled) return;

    // Clear existing timer
    clearTimer();

    // Mark that we have a pending save
    hasPendingSaveRef.current = true;

    // Set new timer
    timeoutRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;

      isSavingRef.current = true;
      hasPendingSaveRef.current = false;

      try {
        await onSave();
      } catch (error) {
        console.error('[useAutoSave] Save failed:', error);
      } finally {
        isSavingRef.current = false;
      }
    }, delay);
  }, [onSave, delay, enabled, clearTimer]);

  // Flush immediately (save now, cancel debounce)
  const flush = useCallback(async () => {
    if (!enabled) return;

    // Clear the timer
    clearTimer();

    // If there's a pending save or we're about to unmount, save now
    if (hasPendingSaveRef.current && !isSavingRef.current) {
      isSavingRef.current = true;
      hasPendingSaveRef.current = false;

      try {
        await onSave();
      } catch (error) {
        console.error('[useAutoSave] Flush failed:', error);
      } finally {
        isSavingRef.current = false;
      }
    }
  }, [onSave, enabled, clearTimer]);

  // Cleanup on unmount - flush any pending saves
  useEffect(() => {
    return () => {
      // Flush synchronously on unmount (best effort)
      if (hasPendingSaveRef.current && !isSavingRef.current) {
        // We can't use async here, but we can fire-and-forget
        onSave().catch(err => console.error('[useAutoSave] Unmount save failed:', err));
      }
      clearTimer();
    };
  }, [onSave, clearTimer]);

  return {
    trigger,  // Trigger debounced save
    flush     // Flush immediately
  };
}
