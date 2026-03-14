import { defineConfig } from 'vite';
import { resolve } from 'path';

// Host bundle build — loaded by the Electron main process into a vm.createContext sandbox.
// All dependencies MUST be inlined by Rollup (no require() after bundling).
// Output: dist/host-bundle.cjs
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/host-bundle.ts'),
      formats: ['cjs'],
      fileName: () => 'host-bundle.cjs'
    },
    rollupOptions: {
      // Bundle everything inline — the VM sandbox has no module system
      external: [],
      output: {
        preserveModules: false
      }
    },
    outDir: 'dist',
    emptyOutDir: false  // do not wipe the renderer build output
  }
});
