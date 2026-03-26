import { AIProvider } from '../AIIntentTypes';
import {
  BaseAIAdapter,
  AIAdapterConfig,
  ProviderCapabilities,
  PROVIDER_CAPABILITY_PROFILES,
  AIRequest,
  AIResponse,
} from './AIAdapter';
import { ErrorHandler } from '../../errors/ErrorHandler';
import { ErrorCode } from '../../errors/AppError';

export interface GeminiConfig extends AIAdapterConfig {
  apiKey: string;
  model?: string;
}

export class GeminiAdapter extends BaseAIAdapter {
  readonly provider = AIProvider.GEMINI;
  model = 'gemini-1.5-pro';
  private apiKey = '';
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  async initialize(config: GeminiConfig): Promise<void> {
    await super.initialize(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-1.5-pro';
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    this.ensureInitialized();

    const modelName = `models/${request.model || this.model}`;
    const url = `${this.baseUrl}/${modelName}:generateContent?key=${this.apiKey}`;

    const response = await this.executeWithTimeout(
      () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: request.systemPrompt
                      ? `${request.systemPrompt}\n\n${request.prompt}`
                      : request.prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: request.temperature ?? 0.7,
              maxOutputTokens: request.maxTokens ?? 2000,
              topP: 0.95,
              topK: 40,
            },
          }),
        }),
      request.maxTokens ? undefined : this.config.timeout
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw ErrorHandler.internalServerError(
        `Gemini API error: ${response.status} - ${error.error?.message || response.statusText}`,
        { errorCode: String(ErrorCode.AI_PROVIDER_ERROR) }
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
        safetyRatings?: Array<{ category: string; probability: string }>;
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';

    return {
      content,
      provider: this.provider,
      model: request.model || this.model,
      tokensUsed: data.usageMetadata?.totalTokenCount,
      finishReason: this.mapFinishReason(candidate?.finishReason),
    };
  }

  async stream(
    request: AIRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    this.ensureInitialized();

    const modelName = `models/${request.model || this.model}:streamGenerateContent?key=${this.apiKey}`;
    const url = `${this.baseUrl}/${modelName}`;

    const response = await this.executeWithTimeout(
      () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: request.systemPrompt
                      ? `${request.systemPrompt}\n\n${request.prompt}`
                      : request.prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: request.temperature ?? 0.7,
              maxOutputTokens: request.maxTokens ?? 2000,
              topP: 0.95,
              topK: 40,
            },
            stream: true,
          }),
        }),
      request.maxTokens ? undefined : this.config.timeout
    );

    if (!response.ok || !response.body) {
      throw ErrorHandler.internalServerError(
        `Gemini stream error: ${response.status}`,
        { errorCode: String(ErrorCode.AI_PROVIDER_ERROR) }
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let totalTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk
          .split('\n')
          .filter((line) => line.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              fullContent += content;
              onChunk(content);
            }
            if (parsed.usageMetadata) {
              totalTokens = parsed.usageMetadata.totalTokenCount;
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      content: fullContent,
      provider: this.provider,
      model: this.model,
      tokensUsed: totalTokens,
      finishReason: 'stop',
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      ...PROVIDER_CAPABILITY_PROFILES[AIProvider.GEMINI],
      maxContextTokens: this.getModelContextSize(),
    };
  }

  private getModelContextSize(): number {
    const modelSizes: Record<string, number> = {
      'gemini-1.5-pro': 1000000,
      'gemini-1.5-flash': 1000000,
      'gemini-1.5-flash-8b': 1000000,
      'gemini-pro': 30000,
      'gemini-pro-vision': 30000,
    };
    return modelSizes[this.model] ?? 1000000;
  }

  private mapFinishReason(
    reason?: string
  ): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      case 'OTHER':
        return 'error';
      default:
        return 'error';
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const modelName = `models/${this.model}`;
      const url = `${this.baseUrl}/${modelName}?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export async function createGeminiAdapter(
  config: GeminiConfig
): Promise<GeminiAdapter> {
  const adapter = new GeminiAdapter();
  await adapter.initialize(config);
  return adapter;
}
