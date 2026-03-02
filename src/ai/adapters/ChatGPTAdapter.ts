import { AIProvider } from '../AIIntentTypes';
import { 
  BaseAIAdapter, 
  AIAdapterConfig, 
  ProviderCapabilities,
  PROVIDER_CAPABILITY_PROFILES,
  AIRequest,
  AIResponse 
} from './AIAdapter';

export interface ChatGPTConfig extends AIAdapterConfig {
  apiKey: string;
  organization?: string;
  model?: string;
}

export class ChatGPTAdapter extends BaseAIAdapter {
  readonly provider = AIProvider.CHATGPT;
  model = 'gpt-4o';
  private apiKey = '';
  private organization?: string;
  private baseUrl = 'https://api.openai.com/v1';

  async initialize(config: ChatGPTConfig): Promise<void> {
    await super.initialize(config);
    this.apiKey = config.apiKey;
    this.organization = config.organization;
    this.model = config.model || 'gpt-4o';
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    }
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    this.ensureInitialized();

    const response = await this.executeWithTimeout(
      () => fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...(this.organization ? { 'OpenAI-Organization': this.organization } : {}),
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
      throw new Error(`ChatGPT API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json() as {
      id: string;
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
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

  async stream(request: AIRequest, onChunk: (chunk: string) => void): Promise<AIResponse> {
    this.ensureInitialized();

    const response = await this.executeWithTimeout(
      () => fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
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
      throw new Error(`ChatGPT stream error: ${response.status}`);
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
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

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
      ...PROVIDER_CAPABILITY_PROFILES[AIProvider.CHATGPT],
      maxContextTokens: this.getModelContextSize(),
    };
  }

  private getModelContextSize(): number {
    const modelSizes: Record<string, number> = {
      'gpt-4o': 128000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-3.5-turbo': 16385,
      'gpt-3.5-turbo-16k': 16385,
    };
    return modelSizes[this.model] ?? 8192;
  }

  private buildMessages(request: AIRequest): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });
    
    return messages;
  }

  private mapFinishReason(reason?: string): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'content_filter': return 'content_filter';
      default: return 'error';
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export async function createChatGPTAdapter(config: ChatGPTConfig): Promise<ChatGPTAdapter> {
  const adapter = new ChatGPTAdapter();
  await adapter.initialize(config);
  return adapter;
}
