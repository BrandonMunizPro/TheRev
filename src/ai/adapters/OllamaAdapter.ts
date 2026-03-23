import { AIProvider } from '../AIIntentTypes';
import { 
  BaseAIAdapter, 
  AIAdapterConfig, 
  ProviderCapabilities,
  PROVIDER_CAPABILITY_PROFILES,
  AIRequest,
  AIResponse 
} from './AIAdapter';
import { ollamaRepair, OllamaRepairOptions } from '../OllamaRepairService';

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

    // Add timeout for larger models like Mistral
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

    try {
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
        signal: controller.signal,
      });
      clearTimeout(timeout);

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
    } catch (error) {
      clearTimeout(timeout);
      await this.handleOllamaError(error);
      throw error;
    }
  }

  private async handleOllamaError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('CUDA error') || 
        errorMessage.includes('runner process') ||
        errorMessage.includes('GPU')) {
      console.log('[OllamaAdapter] Detected Ollama issue, attempting repair...');
      
      const repairOptions: OllamaRepairOptions = {
        autoRepair: true,
        allowReinstall: true,
        modelToTest: this.model
      };
      
      const result = await ollamaRepair.checkAndRepair(errorMessage);
      
      if (result.success) {
        console.log('[OllamaAdapter] Repair successful:', result.actionsPerformed);
      } else if (result.userMessage) {
        console.warn('[OllamaAdapter] Repair needed:', result.userMessage);
      }
    }
  }

  async stream(request: AIRequest, onChunk: (chunk: string) => void): Promise<AIResponse> {
    this.ensureInitialized();

    const prompt = request.systemPrompt 
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    try {
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

      reader.releaseLock();

      ollamaRepair.resetFailureCount();

      return {
        content: fullContent,
        provider: this.provider,
        model: this.model,
        tokensUsed: contextLength,
        finishReason: 'stop',
      };
    } catch (error) {
      await this.handleOllamaError(error);
      throw error;
    }
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

  async testModel(): Promise<{ success: boolean; error?: string; repairTriggered?: boolean }> {
    console.log(`[OllamaAdapter] Testing model: ${this.model}`);
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: 'Hi',
          stream: false,
          options: { num_predict: 5 }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        ollamaRepair.resetFailureCount();
        console.log('[OllamaAdapter] Model test successful');
        return { success: true };
      }

      const errorText = await response.text();
      console.log('[OllamaAdapter] Model test failed:', errorText);

      const repairResult = await ollamaRepair.checkAndRepair(errorText);
      
      return { 
        success: false, 
        error: errorText,
        repairTriggered: repairResult.actionsPerformed.length > 0
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log('[OllamaAdapter] Model test error:', errorMessage);

      const repairResult = await ollamaRepair.checkAndRepair(errorMessage);
      
      return { 
        success: false, 
        error: errorMessage,
        repairTriggered: repairResult.actionsPerformed.length > 0
      };
    }
  }

  async getDiagnostics(): Promise<{
    healthy: boolean;
    running: boolean;
    modelsAvailable: string[];
    modelTested: boolean;
    modelTestSuccess: boolean;
    lastError: string | null;
  }> {
    const result = {
      healthy: false,
      running: false,
      modelsAvailable: [] as string[],
      modelTested: false,
      modelTestSuccess: false,
      lastError: null as string | null
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        result.running = true;
        const data = await response.json() as { models?: Array<{ name: string }> };
        result.modelsAvailable = (data.models ?? []).map(m => m.name);
      }
    } catch (error) {
      result.lastError = error instanceof Error ? error.message : 'Connection failed';
      return result;
    }

    if (result.running && result.modelsAvailable.length > 0) {
      result.modelTested = true;
      const testResult = await this.testModel();
      result.modelTestSuccess = testResult.success;
      if (!testResult.success) {
        result.lastError = testResult.error ?? 'Model test failed';
      }
    }

    result.healthy = result.running && result.modelTestSuccess;
    return result;
  }
}

export function createOllamaAdapter(config?: OllamaConfig): OllamaAdapter {
  const adapter = new OllamaAdapter();
  if (config) {
    adapter.initialize(config);
  }
  return adapter;
}
