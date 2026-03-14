/**
 * plugin-soap-ui / host-bundle.ts
 *
 * Main-process module for @apiquest/plugin-soap-ui.
 * Runs inside a vm.createContext sandbox in the Electron main process.
 *
 * The sandbox globals (handlers, file, fetch, console) are the ONLY identifiers
 * available at runtime. This file is compiled to a self-contained CJS bundle by Rollup;
 * no require() calls survive into the bundle.
 *
 * The PluginSandboxGlobals type from @apiquest/plugin-ui-types documents the
 * exact runtime shape of the injected globals for type-safety during development.
 */

import type { PluginSandboxGlobals } from '@apiquest/plugin-ui-types';

// At runtime these globals are injected by the host into the VM context.
// We access them via a typed cast of globalThis so TypeScript understands the shape
// without redeclaring built-in globals like fetch / console.
const {
  handlers,
  file,
  fetch: hostFetch,
  console: hostConsole,
} = globalThis as unknown as PluginSandboxGlobals;

// ---------------------------------------------------------------------------
// Handler: loadWsdl
//
// Called from the renderer via:
//   uiContext.host.invoke<{ xml: string }>('loadWsdl', { location: '...' })
//
// location may be:
//   - An http:// or https:// URL  → fetched via hostFetch (main process, no CORS)
//   - An absolute file path       → requires the path to have been granted by the user
//                                   via uiContext.host.showOpenDialog() first
//
// Returns { xml: string } — the raw WSDL XML text.
// The renderer is responsible for parsing the returned XML.
// ---------------------------------------------------------------------------

handlers.on('loadWsdl', async (payload: unknown): Promise<{ xml: string }> => {
  const { location } = payload as { location: string };

  if (!location || typeof location !== 'string') {
    throw new Error('[plugin-soap-ui] loadWsdl: location must be a non-empty string');
  }

  let xml: string;

  if (location.startsWith('http://') || location.startsWith('https://')) {
    hostConsole.log('Fetching WSDL from URL:', location);
    xml = await hostFetch(location);
  } else {
    // Treat as a file path — must have been granted via showOpenDialog
    hostConsole.log('Reading WSDL from file:', location);
    xml = await file.readText(location);
  }

  hostConsole.info(`WSDL loaded (${xml.length} chars)`);
  return { xml };
});

hostConsole.log('host-bundle initialized');
