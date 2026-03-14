import { ipcMain } from 'electron';
import { settingsService } from '../SettingsService.js';

type AICompletionRequest = {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
};

type AICompletionResponse = {
  text: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
};

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
  return Boolean(
    settings.ai?.enabled === true &&
    settings.ai?.baseUrl?.trim() &&
    settings.ai?.apiKey?.trim() &&
    settings.ai?.model?.trim()
  );
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

export function registerAiHandlers() {
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
            ...(request.systemPrompt
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

