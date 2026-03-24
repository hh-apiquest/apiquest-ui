import type { PluginInteractionResult, PluginOpenDialogOptions } from '@apiquest/plugin-ui-types';

export interface PluginInteractionRequest {
  requestId: string;
  packageName: string;
  promptKey: string;
  payload: unknown;
}

export type PluginInteractionResponse =
  | ({ requestId: string } & PluginInteractionResult)
  | {
      requestId: string;
      ok: boolean;
      value?: unknown;
      reason?: 'cancelled' | 'dismissed' | 'timeout' | 'renderer-unavailable';
    };

export interface QuestHostApi {
  showOpenDialog(packageName: string, options: PluginOpenDialogOptions): Promise<string[] | null>;
  readFile(packageName: string, filePath: string): Promise<string>;
  fetchText(packageName: string, url: string, options?: { headers?: Record<string, string> }): Promise<string>;
  invoke<T = unknown>(packageName: string, action: string, payload?: unknown): Promise<T>;
  onInteractionRequest(callback: (req: PluginInteractionRequest) => void): () => void;
  sendInteractionResponse(response: PluginInteractionResponse): void;
}
