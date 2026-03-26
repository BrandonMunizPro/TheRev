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

export interface ClaudeConfig extends AIAdapterConfig {
  apiKey: string;
  model?: string;
}

export class ClaudeAdapter extends BaseAIAdapter {
  readonly provider = AIProvider.CLAUDE;
  model = 'claude-sonnet-4-20250514';
  private apiKey = '';
  private baseUrl = 'https://api.anthropic.com/v1';

  async initialize(config: ClaudeConfig): Promise<void> {
    await super.initialize(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-sonnet-4-20250514';
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    this.ensureInitialized();

    const response = await this.executeWithTimeout(
      () =>
        fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: request.model || this.model,
            messages: this.buildMessages(request),
            max_tokens: request.maxTokens ?? 2000,
            temperature: request.temperature ?? 0.7,
            stream: false,
          }),
        }),
      request.maxTokens ? undefined : this.config.timeout
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw ErrorHandler.internalServerError(
        `Claude API error: ${response.status} - ${error.error?.message || response.statusText}`,
        { errorCode: String(ErrorCode.AI_PROVIDER_ERROR) }
      );
    }

    const data = (await response.json()) as {
      id: string;
      content: Array<{ type: string; text: string }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const textContent = data.content.find((c) => c.type === 'text');
    return {
      content: textContent?.text || '',
      provider: this.provider,
      model: request.model || this.model,
      tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
      finishReason: this.mapFinishReason(data.stop_reason),
    };
  }

  async stream(
    request: AIRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    this.ensureInitialized();

    const response = await this.executeWithTimeout(
      () =>
        fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: request.model || this.model,
            messages: this.buildMessages(request),
            max_tokens: request.maxTokens ?? 2000,
            temperature: request.temperature ?? 0.7,
            stream: true,
          }),
        }),
      request.maxTokens ? undefined : this.config.timeout
    );

    if (!response.ok || !response.body) {
      throw ErrorHandler.internalServerError(
        `Claude stream error: ${response.status}`,
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
            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text;
              if (text) {
                fullContent += text;
                onChunk(text);
              }
            }
            if (parsed.usage) {
              totalTokens =
                parsed.usage.input_tokens + parsed.usage.output_tokens;
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
      ...PROVIDER_CAPABILITY_PROFILES[AIProvider.CLAUDE],
      maxContextTokens: this.getModelContextSize(),
    };
  }

  private getModelContextSize(): number {
    const modelSizes: Record<string, number> = {
      'claude-opus-4-20250514': 200000,
      'claude-sonnet-4-20250514': 200000,
      'claude-haiku-3-20250514': 200000,
      'claude-3-opus': 200000,
      'claude-3-sonnet': 200000,
      'claude-3-haiku': 200000,
      'claude-2.1': 200000,
      'claude-2': 100000,
      'claude-instant': 100000,
    };
    return modelSizes[this.model] ?? 200000;
  }

  private buildMessages(
    request: AIRequest
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({ role: 'user', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    return messages;
  }

  private mapFinishReason(
    reason?: string
  ): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'content_filtered':
        return 'content_filter';
      default:
        return 'error';
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
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

export async function createClaudeAdapter(
  config: ClaudeConfig
): Promise<ClaudeAdapter> {
  const adapter = new ClaudeAdapter();
  await adapter.initialize(config);
  return adapter;
}
