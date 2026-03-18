import React from 'react';
import type {
  IImporterPluginUI,
  PluginUIContext,
  PluginInteractionRegistration,
} from '@apiquest/plugin-ui-types';
import type * as RadixTypes from '@radix-ui/themes';
import { createInsomniaPreConvertDialog } from './interactions/InsomniaPreConvertDialog';
import { createInsomniaFailureDialog } from './interactions/InsomniaFailureDialog';
import { createPostmanPreConvertDialog } from './interactions/PostmanPreConvertDialog';
import { createImportFailureDialog } from './interactions/ImportFailureDialog';

import {
  FILE_EXTENSIONS,
  IMPORT_FORMATS,
  detectImportFormat,
  isImportFormat,
  normalizeInputToText,
  type ImportFormat,
} from './importer/formats';

type ImporterPluginSettings = {
  enableAIScriptAssist?: boolean;
  showAdvancedScriptOptions?: boolean;
  scriptConversionMode?: 'rule' | 'ai';
  strictScriptConversion?: boolean;
  aiPrompt?: string;
};

type ImportCollectionOptions = {
  pluginSettings?: Record<string, unknown>;
  [key: string]: unknown;
};

type ImportValidationResult = {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
};

let uiContext: PluginUIContext | null = null;

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function getSettings(pluginSettings: Record<string, unknown> | undefined): ImporterPluginSettings {
  const scriptConversionMode =
    pluginSettings?.scriptConversionMode === 'ai' || pluginSettings?.scriptConversionMode === 'rule'
      ? pluginSettings.scriptConversionMode
      : 'rule';

  const aiPrompt = typeof pluginSettings?.aiPrompt === 'string' ? pluginSettings.aiPrompt : '';

  return {
    enableAIScriptAssist: normalizeBoolean(pluginSettings?.enableAIScriptAssist, true),
    showAdvancedScriptOptions: normalizeBoolean(pluginSettings?.showAdvancedScriptOptions, false),
    scriptConversionMode,
    strictScriptConversion: normalizeBoolean(pluginSettings?.strictScriptConversion, false),
    aiPrompt,
  };
}

const importerPlugin: IImporterPluginUI = {
  name: 'ApiQuest Importer',
  version: '0.1.0',
  description: 'Imports Postman v2.1, Insomnia (JSON/YAML), and OpenAPI 3.x into ApiQuest collections',

  importFormats: [...IMPORT_FORMATS],

  fileExtensions: FILE_EXTENSIONS,

  setup(context: PluginUIContext): void {
    uiContext = context;
  },

  /**
   * Tier 3 — Register interaction components used by the Insomnia host-bundle
   * when it calls ui.prompt('insomnia:pre-convert-options') and
   * ui.prompt('insomnia:failure').
   *
   * The Radix namespace from PluginUIContext is captured via closure and passed
   * to the component factories so that dialogs render consistently with the
   * desktop UI theme.
   */
  getInteractionRegistrations(): PluginInteractionRegistration[] {
    const RT = (uiContext?.Radix ?? null) as typeof RadixTypes | null;
    return [
      {
        promptKey: 'insomnia:pre-convert-options',
        Component: createInsomniaPreConvertDialog(RT),
      },
      {
        promptKey: 'insomnia:failure',
        Component: createInsomniaFailureDialog(RT),
      },
      {
        promptKey: 'postman:pre-convert-options',
        Component: createPostmanPreConvertDialog(RT),
      },
      {
        promptKey: 'postman:failure',
        Component: createImportFailureDialog(RT, 'Postman'),
      },
    ];
  },

  getDefaultSettings(): Record<string, unknown> {
    const defaults: ImporterPluginSettings = {
      enableAIScriptAssist: true,
      showAdvancedScriptOptions: false,
      scriptConversionMode: 'rule',
      strictScriptConversion: false,
      aiPrompt: '',
    };

    return defaults;
  },

  renderSettings(
    pluginSettings: Record<string, unknown> | undefined,
    onChange: (settings: Record<string, unknown> | undefined) => void,
    context: PluginUIContext
  ): React.ReactNode {
    const RT = context.Radix;
    const settings = getSettings(pluginSettings);

    return (
      <RT.Flex direction="column" gap="2" mt="2">
        <RT.Flex align="center" justify="between">
          <RT.Text size="2" weight="medium">
            Enable AI script assistance
          </RT.Text>
          <RT.Switch
            checked={settings.enableAIScriptAssist === true}
            onCheckedChange={(checked: boolean): void => {
              onChange({
                ...settings,
                enableAIScriptAssist: checked,
              });
            }}
          />
        </RT.Flex>
        <RT.Text size="1" color="gray">
          Allows this importer to request AI-assisted script conversion through desktop-managed global AI settings.
        </RT.Text>

        <RT.Separator size="4" mt="2" mb="1" />

        <RT.Flex align="center" justify="between">
          <RT.Text size="2" weight="medium">
            Show advanced script conversion options
          </RT.Text>
          <RT.Switch
            checked={settings.showAdvancedScriptOptions === true}
            onCheckedChange={(checked: boolean): void => {
              onChange({
                ...settings,
                showAdvancedScriptOptions: checked,
              });
            }}
          />
        </RT.Flex>

        {settings.showAdvancedScriptOptions === true ? (
          <RT.Flex direction="column" gap="2" mt="1">
            <RT.Text size="1" color="gray">
              Configure script conversion strategy used by importer host conversion pipeline.
            </RT.Text>

            <RT.RadioGroup.Root
              value={settings.scriptConversionMode ?? 'rule'}
              onValueChange={(value: string): void => {
                const mode = value === 'ai' ? 'ai' : 'rule';
                onChange({
                  ...settings,
                  scriptConversionMode: mode,
                });
              }}
            >
              <RT.Flex direction="column" gap="1">
                <RT.Text as="label" size="2">
                  <RT.Flex align="center" gap="2">
                    <RT.RadioGroup.Item value="rule" />
                    Rule-based conversion
                  </RT.Flex>
                </RT.Text>
                <RT.Text as="label" size="2">
                  <RT.Flex align="center" gap="2">
                    <RT.RadioGroup.Item value="ai" />
                    AI-assisted conversion (uses global AI settings)
                  </RT.Flex>
                </RT.Text>
              </RT.Flex>
            </RT.RadioGroup.Root>

            <RT.Flex align="center" justify="between">
              <RT.Text size="2">Strict script conversion mode</RT.Text>
              <RT.Switch
                checked={settings.strictScriptConversion === true}
                onCheckedChange={(checked: boolean): void => {
                  onChange({
                    ...settings,
                    strictScriptConversion: checked,
                  });
                }}
              />
            </RT.Flex>

            <RT.TextArea
              value={settings.aiPrompt ?? ''}
              placeholder="Optional AI prompt for script conversion behavior"
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => {
                onChange({
                  ...settings,
                  aiPrompt: event.target.value,
                });
              }}
              rows={4}
            />
          </RT.Flex>
        ) : null}
      </RT.Flex>
    );
  },

  detectFormat(data: string | unknown): string | null {
    return detectImportFormat(data);
  },

  validate(data: string | unknown, format: string): ImportValidationResult {
    if (!isImportFormat(format)) {
      return {
        valid: false,
        errors: [`Unsupported import format: ${format}`],
      };
    }

    const text = normalizeInputToText(data);
    if (text === null || text.trim() === '') {
      return {
        valid: false,
        errors: ['Import file is empty'],
      };
    }

    return {
      valid: true,
      warnings: ['Importer converter is scaffolded. Full format conversion implementation is pending.'],
    };
  },

  async importCollection(
    data: string | unknown,
    format: string,
    options?: ImportCollectionOptions
  ): Promise<Record<string, unknown>> {
    const payloadData = normalizeInputToText(data);
    if (payloadData === null) {
      throw new Error('[plugin-importer-ui] importCollection: input must be string-serializable');
    }

    if (uiContext?.host === undefined) {
      throw new Error('[plugin-importer-ui] importCollection requires desktop host bridge');
    }

    return uiContext.host.invoke<Record<string, unknown>>('convert', {
      data: payloadData,
      format,
      options: {
        ...options,
        convertScripts: true,
        scriptConversionMode:
          getSettings(options?.pluginSettings).scriptConversionMode ?? 'rule',
        strictScriptConversion:
          getSettings(options?.pluginSettings).strictScriptConversion === true,
        aiPrompt: getSettings(options?.pluginSettings).aiPrompt ?? '',
      },
    });
  },

  getOptionsSchema(format: string): Record<string, unknown> {
    const schemaFormat: ImportFormat | string = isImportFormat(format) ? format : 'custom';

    return {
      type: 'object',
      title: `Import options (${schemaFormat})`,
      properties: {
        preserveDisabledRequests: {
          type: 'boolean',
          default: true,
          description: 'Keep disabled requests/folders as disabled metadata where possible.',
        },
        includeScripts: {
          type: 'boolean',
          default: true,
          description: 'Import script/test blocks when present.',
        },
      },
    };
  },
};

export default importerPlugin;

