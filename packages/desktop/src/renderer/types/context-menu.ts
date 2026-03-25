export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface EnvironmentContextInfo {
  isActive?: boolean;
}

export interface ContextMenuResource {
  dependsOn?: string[];
  condition?: string;
}
