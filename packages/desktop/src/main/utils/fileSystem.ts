// File system utility functions
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Walk directory recursively and find files matching pattern
 */
export async function walkDirectory(dir: string, pattern: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      
      if (entry.isDirectory()) {
        const subResults = await walkDirectory(fullPath, pattern);
        results.push(...subResults);
      } else if (entry.isFile() && entry.name.endsWith(pattern)) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Failed to read directory: ${dir}`, err);
  }
  return results;
}
