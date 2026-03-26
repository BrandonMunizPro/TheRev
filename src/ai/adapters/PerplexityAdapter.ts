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

export interface PerplexityConfig extends AIAdapterConfig {
  apiKey: string;
  model?: string;
}

export class PerplexityAdapter extends BaseAIAdapter {
  readonly provider = AIProvider.PERPLEXITY;
  model = 'llama-3.1-sonar-large-128k-online';
  private apiKey = '';
  private baseUrl = 'https://api.perplexity.ai';

  async initialize(config: PerplexityConfig): Promise<void> {
    await super.initialize(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'llama-3.1-sonar-large-128k-online';
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    this.ensureInitialized();

    const response = await this.executeWithTimeout(
      () =>
        fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: request.model || this.model,
            messages: this.buildMessages(request),
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 2000,
            stream: false,
          }),
        }),
      request.maxTokens ? undefined : this.config.timeout
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw ErrorHandler.internalServerError(
        `Perplexity API error: ${response.status} - ${error.error?.message || response.statusText}`,
        { errorCode: String(ErrorCode.AI_PROVIDER_ERROR) }
      );
    }

    const data = (await response.json()) as {
      id: string;
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = data.choices[0];
    return {
      content: choice?.message?.content || '',
      provider: this.provider,
      model: request.model || this.model,
      tokensUsed: data.usage?.total_tokens,
      finishReason: this.mapFinishReason(choice?.finish_reason),
    };
  }

  async stream(
    request: AIRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    this.ensureInitialized();

    const response = await this.executeWithTimeout(
      () =>
        fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: request.model || this.model,
            messages: this.buildMessages(request),
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 2000,
            stream: true,
          }),
        }),
      request.maxTokens ? undefined : this.config.timeout
    );

    if (!response.ok || !response.body) {
      throw ErrorHandler.internalServerError(
        `Perplexity stream error: ${response.status}`,
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
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              onChunk(content);
            }
            if (parsed.usage) {
              totalTokens = parsed.usage.total_tokens;
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
      ...PROVIDER_CAPABILITY_PROFILES[AIProvider.PERPLEXITY],
      maxContextTokens: this.getModelContextSize(),
    };
  }

  private getModelContextSize(): number {
    const modelSizes: Record<string, number> = {
      'llama-3.1-sonar-large-128k-online': 127072,
      'llama-3.1-sonar-small-128k-online': 127072,
      'llama-3.1-sonar-large-128k-chat': 127072,
      'llama-3.1-sonar-small-128k-chat': 127072,
      'llama-3-sonar-large-32k-online': 32000,
      'llama-3-sonar-small-32k-online': 32000,
      'mixtral-8x7b-instruct': 32000,
    };
    return modelSizes[this.model] ?? 128000;
  }

  private buildMessages(
    request: AIRequest
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    return messages;
  }

  private mapFinishReason(
    reason?: string
  ): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'error';
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }
}

export async function createPerplexityAdapter(
  config: PerplexityConfig
): Promise<PerplexityAdapter> {
  const adapter = new PerplexityAdapter();
  await adapter.initialize(config);
  return adapter;
}
