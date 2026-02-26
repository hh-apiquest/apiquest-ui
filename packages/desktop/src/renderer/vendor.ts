/**
 * Vendor Module - Re-exports shared dependencies for plugins
 * 
 * This module re-exports all shared dependencies.
 * Import map redirects bare imports ('react', 'react-dom', etc) to this file,
 * where Vite can properly resolve them.
 */

// Export React - both default and named exports
import ReactDefault from 'react';
export { ReactDefault as default };
export { ReactDefault as React };

// Export ReactDOM
export { default as ReactDOM } from 'react-dom/client';

// Export JSX runtimes as namespaces
export * as jsxRuntime from 'react/jsx-runtime';
export * as jsxDevRuntime from 'react/jsx-dev-runtime';

// Export Radix UI
export * as RadixThemes from '@radix-ui/themes';
export * as RadixColors from '@radix-ui/colors';

// Export Heroicons
export * as HeroiconsOutline from '@heroicons/react/24/outline';
export * as HeroiconsSolid from '@heroicons/react/24/solid';
export * as Heroicons20Solid from '@heroicons/react/20/solid';

// Export plugin types
export * as PluginUITypes from '@apiquest/plugin-ui-types';
