import { AIProvider } from '../AIIntentTypes';
import { AIAdapter, AIAdapterConfig } from './AIAdapter';
import { OllamaAdapter, OllamaConfig } from './OllamaAdapter';

export interface AdapterRegistry {
  [provider: string]: AIAdapter;
}

class AdapterFactory {
  private adapters: Map<AIProvider, AIAdapter> = new Map();

  async registerAdapter(
    provider: AIProvider, 
    adapter: AIAdapter, 
    config?: AIAdapterConfig
  ): Promise<void> {
    if (config) {
      await adapter.initialize(config);
    }
    this.adapters.set(provider, adapter);
  }

  getAdapter(provider: AIProvider): AIAdapter | undefined {
    return this.adapters.get(provider);
  }

  async initializeDefaults(): Promise<void> {
    const ollama = new OllamaAdapter();
    try {
      await ollama.initialize({ baseUrl: 'http://localhost:11434', model: 'llama3' });
      if (await ollama.isHealthy()) {
        this.adapters.set(AIProvider.OPEN_SOURCE, ollama);
        console.log('✓ Ollama adapter initialized (Open Source AI available)');
      }
    } catch {
      console.log('⚠ Ollama not available - run `ollama serve` to enable local AI');
    }
  }

  getAllAdapters(): Map<AIProvider, AIAdapter> {
    return new Map(this.adapters);
  }

  getAvailableProviders(): AIProvider[] {
    return Array.from(this.adapters.keys());
  }
}

export const adapterFactory = new AdapterFactory();

export { AIAdapter, AIAdapterConfig, OllamaAdapter, OllamaConfig };
