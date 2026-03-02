import { AIProvider } from '../AIIntentTypes';
import { AIAdapter, AIAdapterConfig, ProviderCapabilities, PROVIDER_CAPABILITY_PROFILES } from './AIAdapter';
import { CircuitState } from './CircuitBreaker';
import { OllamaAdapter, OllamaConfig } from './OllamaAdapter';
import { ChatGPTAdapter, ChatGPTConfig } from './ChatGPTAdapter';
import { ClaudeAdapter, ClaudeConfig } from './ClaudeAdapter';
import { GeminiAdapter, GeminiConfig } from './GeminiAdapter';
import { PerplexityAdapter, PerplexityConfig } from './PerplexityAdapter';

export interface AdapterRegistry {
  [provider: string]: AIAdapter;
}

export interface AdapterHealth {
  provider: AIProvider;
  isHealthy: boolean;
  latencyMs?: number;
  lastChecked: Date;
  circuitState: CircuitState;
}

class AdapterFactory {
  private adapters: Map<AIProvider, AIAdapter> = new Map();
  private healthCache: Map<AIProvider, AdapterHealth> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  async registerAdapter(
    provider: AIProvider, 
    adapter: AIAdapter, 
    config?: AIAdapterConfig
  ): Promise<void> {
    if (config) {
      await adapter.initialize(config);
    }
    this.adapters.set(provider, adapter);
    this.healthCache.set(provider, {
      provider,
      isHealthy: false,
      lastChecked: new Date(),
      circuitState: CircuitState.CLOSED,
    });
  }

  getAdapter(provider: AIProvider): AIAdapter | undefined {
    return this.adapters.get(provider);
  }

  async initializeDefaults(): Promise<void> {
    const ollama = new OllamaAdapter();
    try {
      await ollama.initialize({ baseUrl: 'http://localhost:11434', model: 'llama3' });
      if (await ollama.isHealthy()) {
        await this.registerAdapter(AIProvider.OPEN_SOURCE, ollama);
        console.log('✓ Ollama adapter initialized (Open Source AI available)');
      }
    } catch {
      console.log('⚠ Ollama not available - run `ollama serve` to enable local AI');
    }
  }

  async initializeWithConfig(
    configs: Partial<Record<AIProvider, { config: AIAdapterConfig; adapter: AIAdapter }>>
  ): Promise<void> {
    for (const [provider, { config, adapter }] of Object.entries(configs)) {
      try {
        await this.registerAdapter(provider as AIProvider, adapter, config);
        console.log(`✓ ${provider} adapter initialized`);
      } catch (err) {
        console.error(`✗ Failed to initialize ${provider}:`, err);
      }
    }
  }

  getAllAdapters(): Map<AIProvider, AIAdapter> {
    return new Map(this.adapters);
  }

  getAvailableProviders(): AIProvider[] {
    return Array.from(this.adapters.keys());
  }

  async checkHealth(provider: AIProvider): Promise<AdapterHealth> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      return { provider, isHealthy: false, lastChecked: new Date(), circuitState: CircuitState.CLOSED };
    }

    const circuitState = adapter.getCircuitBreakerState();
    const isCircuitOpen = circuitState === CircuitState.OPEN;
    
    const start = Date.now();
    let isHealthy = false;
    
    if (!isCircuitOpen) {
      try {
        isHealthy = await adapter.isHealthy();
      } catch {
        isHealthy = false;
      }
    }
    
    const latencyMs = Date.now() - start;

    const health: AdapterHealth = {
      provider,
      isHealthy: isHealthy && !isCircuitOpen,
      latencyMs: isHealthy ? latencyMs : undefined,
      lastChecked: new Date(),
      circuitState,
    };

    this.healthCache.set(provider, health);
    return health;
  }

  async checkAllHealth(): Promise<AdapterHealth[]> {
    const checks = Array.from(this.adapters.keys()).map(provider => 
      this.checkHealth(provider)
    );
    return Promise.all(checks);
  }

  startHealthMonitoring(intervalMs: number = 60000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllHealth();
    }, intervalMs);
  }

  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  getHealthStatus(provider: AIProvider): AdapterHealth | undefined {
    return this.healthCache.get(provider);
  }

  getAllHealthStatus(): AdapterHealth[] {
    return Array.from(this.healthCache.values());
  }

  getProviderCapabilities(provider: AIProvider): ProviderCapabilities | undefined {
    return PROVIDER_CAPABILITY_PROFILES[provider];
  }

  getBestAvailableProvider(): AIProvider | null {
    const available = Array.from(this.healthCache.entries())
      .filter(([_, health]) => health.isHealthy && health.circuitState !== CircuitState.OPEN)
      .sort((a, b) => (a[1].latencyMs ?? Infinity) - (b[1].latencyMs ?? Infinity));
    
    return available.length > 0 ? available[0][0] : null;
  }

  getHealthyProviders(): AIProvider[] {
    return Array.from(this.healthCache.entries())
      .filter(([_, health]) => health.isHealthy && health.circuitState !== CircuitState.OPEN)
      .map(([provider]) => provider);
  }
}

export const adapterFactory = new AdapterFactory();

export { 
  AIAdapter, 
  AIAdapterConfig, 
  ProviderCapabilities,
  PROVIDER_CAPABILITY_PROFILES,
  OllamaAdapter, 
  OllamaConfig,
  ChatGPTAdapter,
  ChatGPTConfig,
  ClaudeAdapter,
  ClaudeConfig,
  GeminiAdapter,
  GeminiConfig,
  PerplexityAdapter,
  PerplexityConfig,
};
