// Desktop UI Plugin Interfaces
// COMPLETELY DECOUPLED from fracture execution plugins
// Desktop uses fracture for execution but has its own UI plugin system

import { ApiquestMetadata } from '@apiquest/plugin-ui-types';
import React from 'react';

/**
 * Simple Request/Response data structures (NO fracture dependency)
 * Desktop just needs these as data, fracture handles execution
 */
export interface RequestData {
  id: string;
  name: string;
  protocol: string;
  data: any;  // Protocol-specific data
  auth?: {
    type: string;
    data?: any;
  };
}

export interface ResponseData {
  protocol: string;
  status: {
    code: number;
    text: string;
  };
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
}

/**
 * UI Context provided to plugin UI components
 */
export interface UIContext {
  request: RequestData | null;
  response: ResponseData | null;
  activeEnvironment: string | null;
  theme: 'light' | 'dark';
}

/**
 * UI Tab definition
 */
export interface UITab {
  id: string;
  label: string;
  icon?: string;
  position?: number;
  condition?: (context: UIContext) => boolean;
  component: React.ComponentType<UITabProps>;
}

export interface UITabProps {
  request: RequestData;
  onChange: (request: RequestData) => void;
  context: UIContext;
}

/**
 * Installed Plugin Info (for desktop display)
 */
export interface InstalledPluginInfo {
  id: string;
  name: string;
  version: string;
  type: ApiquestMetadata['type'];
  protocol?: string;  // For protocol plugins
  authType?: string;  // For auth plugins
  enabled: boolean;
  bundled: boolean;
}
