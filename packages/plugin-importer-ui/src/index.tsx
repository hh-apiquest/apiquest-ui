import React from 'react';
import type { IImporterPluginUI, PluginUIContext } from '@apiquest/plugin-ui-types';

type ImporterPluginSettings = {
  enableAIScriptAssist?: boolean;
};

let UI: PluginUIContext;

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

const importerPlugin: IImporterPluginUI = {
  name: 'ApiQuest Importer',
  version: '0.1.0',
  description: 'Imports Postman v2.1, Insomnia export JSON, and OpenAPI 3.x into ApiQuest collections',

  importFormats: ['postman-v2.1', 'insomnia-json', 'openapi-3.0', 'openapi-3.1'],

  fileExtensions: {
    'postman-v2.1': { kind: 'file', extensions: ['.json'] },
    'insomnia-json': { kind: 'file', extensions: ['.json'] },
    'openapi-3.0': { kind: 'file', extensions: ['.json', '.yaml', '.yml'] },
    'openapi-3.1': { kind: 'file', extensions: ['.json', '.yaml', '.yml'] }
  },

  setup(uiContext: PluginUIContext): void {
    UI = uiContext;
  },

  getDefaultSettings(): Record<string, unknown> {
    const defaults: ImporterPluginSettings = {
      enableAIScriptAssist: true
    };
    return defaults;
  },

  renderSettings(
    pluginSettings: Record<string, unknown> | undefined,
    onChange: (settings: Record<string, unknown> | undefined) => void,
    uiContext: PluginUIContext
  ): React.ReactNode {
    const RT = uiContext.Radix;
    const settings: ImporterPluginSettings = {
      enableAIScriptAssist: normalizeBoolean(pluginSettings?.enableAIScriptAssist, true)
    };

    return (
      <RT.Flex direction="column" gap="2" mt="2">
        <RT.Flex align="center" justify="between">
          <RT.Text size="2" weight="medium">Enable AI script assistance</RT.Text>
          <RT.Switch
            checked={settings.enableAIScriptAssist === true}
            onCheckedChange={(checked) => {
              onChange({
                ...settings,
                enableAIScriptAssist: checked
              });
            }}
          />
        </RT.Flex>
        <RT.Text size="1" color="gray">
          Allows this importer to request AI-assisted script conversion through desktop-managed global AI settings.
        </RT.Text>
      </RT.Flex>
    );
  },

  detectFormat(data: string | any): string | null {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    if (!text) return null;

    if (text.includes('"_postman_id"') || text.includes('"postman_id"')) {
      return 'postman-v2.1';
    }

    if (text.includes('"_type"') && text.includes('"__export_format"')) {
      return 'insomnia-json';
    }

    if (text.includes('"openapi"')) {
      if (text.includes('"3.1')) return 'openapi-3.1';
      if (text.includes('"3.0')) return 'openapi-3.0';
      return 'openapi-3.0';
    }

    return null;
  },

  validate(data: string | any, format: string): { valid: boolean; errors?: string[]; warnings?: string[] } {
    const supported = this.importFormats.includes(format);
    if (!supported) {
      return {
        valid: false,
        errors: [`Unsupported import format: ${format}`]
      };
    }

    if (data === null || data === undefined || (typeof data === 'string' && data.trim() === '')) {
      return {
        valid: false,
        errors: ['Import file is empty']
      };
    }

    return {
      valid: true,
      warnings: ['Importer converter is scaffolded. Full format conversion implementation is pending.']
    };
  },

  async importCollection(
    data: string | any,
    format: string,
    options?: {
      pluginSettings?: Record<string, unknown>;
      [key: string]: unknown;
    }
  ): Promise<any> {
    // The workspace:importCollection IPC handler invokes the 'convert' action
    // on this plugin's hostBundle directly (main-process to main-process).
    // This renderer-side importCollection method is called from legacy code paths
    // or from tests. Delegate to the host bridge if available.
    if (UI?.host) {
      return UI.host.invoke('convert', { data, format, options });
    }

    // Fallback stub for environments without host bridge (tests, web preview, etc.)
    const warnings: string[] = [
      'Host bridge not available. Conversion ran in fallback renderer path with no data mapping.'
    ];
    return {
      info: {
        id: `imported-${Date.now()}`,
        name: `Imported (${format})`,
        description: `Imported from ${format}`
      },
      items: [],
      variables: [],
      warnings
    };
  },

  getOptionsSchema(format: string): any {
    return {
      type: 'object',
      title: `Import options (${format})`,
      properties: {
        preserveDisabledRequests: {
          type: 'boolean',
          default: true,
          description: 'Keep disabled requests/folders as disabled metadata where possible.'
        },
        includeScripts: {
          type: 'boolean',
          default: true,
          description: 'Import script/test blocks when present.'
        }
      }
    };
  }
};

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function summarizeSource(source: unknown): Record<string, unknown> {
  if (typeof source === 'string') {
    return {
      type: 'text',
      length: source.length
    };
  }

  if (typeof source === 'object' && source !== null) {
    return {
      type: 'object',
      keys: Object.keys(source as Record<string, unknown>).slice(0, 20)
    };
  }

  return {
    type: typeof source
  };
}

export default importerPlugin;

