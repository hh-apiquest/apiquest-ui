/**
 * Import map is injected inline in index.html before this script loads
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import * as RadixThemes from '@radix-ui/themes';
import { App } from './App';
import '@radix-ui/themes/styles.css';
import './styles.css';

/**
 * Expose critical shared modules as globals so plugins share the same instances.
 * The vendor:// protocol serves shim code that reads from window.__VENDOR__,
 * guaranteeing a single React instance and preventing hook errors.
 *
 * Only React and Radix UI are shared - other deps (heroicons, etc.) are bundled
 * by each plugin individually.
 */
(window as any).__VENDOR__ = {
  react: React,
  reactDom: ReactDOM,
  reactJsxRuntime: ReactJsxRuntime,
  reactJsxDevRuntime: ReactJsxDevRuntime,
  radixThemes: RadixThemes,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
