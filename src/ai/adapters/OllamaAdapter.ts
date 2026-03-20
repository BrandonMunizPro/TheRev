import { AIProvider } from '../AIIntentTypes';
import { 
  BaseAIAdapter, 
  AIAdapterConfig, 
  ProviderCapabilities,
  PROVIDER_CAPABILITY_PROFILES,
  AIRequest,
  AIResponse 
} from './AIAdapter';

export interface OllamaConfig extends AIAdapterConfig {
  baseUrl?: string;
  model?: string;
}

export class OllamaAdapter extends BaseAIAdapter {
  readonly provider = AIProvider.OPEN_SOURCE;
  model = 'llama3';

  private baseUrl = 'http://localhost:11434';

  async initialize(config: OllamaConfig): Promise<void> {
    await super.initialize(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llama3';
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    this.ensureInitialized();

    const prompt = request.systemPrompt 
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.model,
        prompt,
        temperature: request.temperature ?? 0.7,
        options: {
          num_predict: request.maxTokens ?? 2048,
        },
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      response: string;
      done: boolean;
      context?: number[];
      total_duration?: number;
    };

    return {
      content: data.response,
      provider: this.provider,
      model: this.model,
      tokensUsed: data.context?.length,
      finishReason: data.done ? 'stop' : 'length',
    };
  }

  async stream(request: AIRequest, onChunk: (chunk: string) => void): Promise<AIResponse> {
    this.ensureInitialized();

    const prompt = request.systemPrompt 
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.model,
        prompt,
        temperature: request.temperature ?? 0.7,
        options: {
          num_predict: request.maxTokens ?? 2048,
        },
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama stream failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let contextLength = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              fullContent += data.response;
              onChunk(data.response);
            }
            if (data.context) {
              contextLength = data.context.length;
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
      tokensUsed: contextLength,
      finishReason: 'stop',
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      ...PROVIDER_CAPABILITY_PROFILES[AIProvider.OPEN_SOURCE],
      maxContextTokens: this.getModelContextSize(),
    };
  }

  private getModelContextSize(): number {
    const modelContextSizes: Record<string, number> = {
      'llama3': 8192,
      'llama2': 4096,
      'mistral': 8192,
      'codellama': 16384,
      'phi3': 4096,
      'mixtral': 32768,
      'gemma': 8192,
    };
    return modelContextSizes[this.model.toLowerCase()] ?? 8192;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createOllamaAdapter(config?: OllamaConfig): OllamaAdapter {
  const adapter = new OllamaAdapter();
  if (config) {
    adapter.initialize(config);
  }
  return adapter;
}
