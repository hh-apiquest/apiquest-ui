import type { IAuthPluginUI, IImporterPluginUI, IProtocolPluginUI } from '@apiquest/plugin-ui-types';
import type { editor as MonacoEditor } from 'monaco-editor';

export interface MonacoThemeDefinition {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
  inherit: boolean;
  rules: MonacoEditor.ITokenThemeRule[];
  colors: MonacoEditor.IColors;
  encodedTokensColors?: string[];
}

export interface ProtocolPluginEventDefinition {
  name: string;
  canHaveTests?: boolean;
}

export interface ProtocolPluginWithEvents extends IProtocolPluginUI {
  events?: ProtocolPluginEventDefinition[];
}

export interface MonacoLoaderInstance {
  editor: {
    defineTheme(name: string, data: MonacoThemeDefinition): void;
  };
}

export interface PluginMonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readonly?: boolean;
  height?: string | number;
  theme?: 'light' | 'dark';
}
