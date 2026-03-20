import { useEffect, type MutableRefObject, type RefObject } from 'react';

type UseInlineRenameOptions = {
  isActive: boolean;
  currentValue: string;
  originalValue: string;
  inputRef: RefObject<HTMLInputElement>;
  focusTimeRef: MutableRefObject<number>;
  onSubmitValue: (value: string) => Promise<void>;
  onComplete: () => void;
};

type UseInlineRenameResult = {
  handleSubmit: () => Promise<void>;
  handleCancel: () => void;
};

export function useInlineRename({
  isActive,
  currentValue,
  originalValue,
  inputRef,
  focusTimeRef,
  onSubmitValue,
  onComplete,
}: UseInlineRenameOptions): UseInlineRenameResult {
  useEffect(() => {
    if (!isActive || inputRef.current === null) {
      return;
    }

    const focusTimeout = window.setTimeout(() => {
      if (inputRef.current === null) {
        return;
      }

      focusTimeRef.current = Date.now();
      inputRef.current.focus();
      inputRef.current.select();
    }, 0);

    return () => window.clearTimeout(focusTimeout);
  }, [focusTimeRef, inputRef, isActive]);

  const handleSubmit = async (): Promise<void> => {
    const timeSinceFocus = Date.now() - focusTimeRef.current;

    if (timeSinceFocus < 100) {
      window.setTimeout(() => {
        if (inputRef.current === null) {
          return;
        }

        inputRef.current.focus();
        inputRef.current.select();
      }, 0);
      return;
    }

    const trimmedValue = currentValue.trim();

    try {
      if (trimmedValue !== '' && trimmedValue !== originalValue) {
        await onSubmitValue(trimmedValue);
      }
    } finally {
      onComplete();
    }
  };

  const handleCancel = (): void => {
    onComplete();
  };

  return {
    handleSubmit,
    handleCancel,
  };
}
