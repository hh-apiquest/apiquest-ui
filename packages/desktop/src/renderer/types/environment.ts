// Desktop-specific environment metadata

/**
 * Desktop Environment Metadata
 */
export interface EnvironmentMetadata {
  id: string;           // Derived from filename (e.g., "Development" from "Development.json")
  name: string;         // Human-readable name (same as id for files)
  fileName: string;     // Filename without extension (e.g., "Development")
  lastModified: Date;   // File modification time
  isActive: boolean;    // Whether this is the active environment
}
