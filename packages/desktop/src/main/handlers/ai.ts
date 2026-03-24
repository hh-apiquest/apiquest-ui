import { ipcMain } from 'electron';
import type {
  AICompletionRequest,
  AICompletionResponse,
  OpenAICompatibleResponse,
} from '../types/ai.js';
import { settingsService } from '../SettingsService.js';

function ensureTrailingNoSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveAiEndpoint(baseUrl: string): string {
  const normalized = ensureTrailingNoSlash(baseUrl.trim());
  if (normalized.endsWith('/v1/chat/completions')) {
    return normalized;
  }

  if (normalized.endsWith('/v1')) {
    return `${normalized}/chat/completions`;
  }

  return `${normalized}/v1/chat/completions`;
}

function isConfigured(settings: Awaited<ReturnType<typeof settingsService.getAll>>): boolean {
  const aiSettings = settings.ai;
  return aiSettings?.enabled === true
    && typeof aiSettings.baseUrl === 'string'
    && aiSettings.baseUrl.trim() !== ''
    && typeof aiSettings.apiKey === 'string'
    && aiSettings.apiKey.trim() !== ''
    && typeof aiSettings.model === 'string'
    && aiSettings.model.trim() !== '';
}

function toCompletionResponse(payload: OpenAICompatibleResponse): AICompletionResponse {
  const firstChoice = payload.choices?.[0];
  const text = firstChoice?.message?.content ?? firstChoice?.text ?? '';

  return {
    text,
    model: payload.model,
    usage: {
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      totalTokens: payload.usage?.total_tokens,
    }
  };
}

export function registerAiHandlers(): void {
  ipcMain.handle('ai:isConfigured', async (): Promise<boolean> => {
    const settings = await settingsService.getAll();
    return isConfigured(settings);
  });

  ipcMain.handle('ai:complete', async (_event, request: AICompletionRequest): Promise<AICompletionResponse> => {
    const settings = await settingsService.getAll();

    if (!isConfigured(settings)) {
      throw new Error('AI is not configured or disabled in settings.');
    }

    const aiSettings = settings.ai!;
    const endpoint = resolveAiEndpoint(aiSettings.baseUrl!);
    const timeoutMs = typeof aiSettings.timeoutMs === 'number' && aiSettings.timeoutMs > 0
      ? aiSettings.timeoutMs
      : 30000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: aiSettings.model,
          messages: [
            ...((typeof request.systemPrompt === 'string' && request.systemPrompt.trim() !== '')
              ? [{ role: 'system', content: request.systemPrompt }]
              : []),
            { role: 'user', content: request.prompt }
          ],
          temperature: request.temperature,
          max_tokens: request.maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI request failed (${response.status}): ${errorText}`);
      }

      const payload = await response.json() as OpenAICompatibleResponse;
      return toCompletionResponse(payload);
    } finally {
      clearTimeout(timer);
    }
  });
}

