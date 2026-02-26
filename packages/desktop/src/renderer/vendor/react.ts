/**
 * React vendor module
 * Re-exports React for plugin consumption via import map
 */
import * as ReactAll from 'react';

// Export default 
export default ReactAll;

// Export all React named exports explicitly (needed for Vite interop)
export const {
  Component,
  PureComponent,
  Fragment,
  StrictMode,
  Suspense,
  createElement,
  createContext,
  createRef,
  forwardRef,
  lazy,
  memo,
  useCallback,
  useContext,
  useDebugValue,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  startTransition,
  useId,
  useDeferredValue,
  Children
} = ReactAll;
