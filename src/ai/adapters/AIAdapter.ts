import { AIProvider, IntentClassificationResult } from '../AIIntentTypes';
import {
  CircuitState,
  CircuitBreaker,
  CircuitBreakerConfig,
} from './CircuitBreaker';

export interface AIRequest {
  provider: AIProvider;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stream?: boolean;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  tokensUsed?: number;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
}

export interface AIAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface ProviderCapabilities {
  maxContextTokens: number;
  supportsStreaming: boolean;
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
  supportsJSON: boolean;
  supportsToolUse: boolean;
  latencyMs: number;
  costPer1kTokens: number;
}

export interface AIAdapter {
  readonly provider: AIProvider;
  readonly model: string;

  initialize(config: AIAdapterConfig): Promise<void>;

  complete(request: AIRequest): Promise<AIResponse>;

  stream(
    request: AIRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse>;

  getCapabilities(): ProviderCapabilities;

  isHealthy(): Promise<boolean>;

  estimateTokens(text: string): number;

  getCircuitBreakerState(): CircuitState;

  getCircuitBreakerStats(): {
    state: string;
    failureCount: number;
    successCount: number;
    lastFailureTime: Date | null;
    nextAttemptTime: Date | null;
  };

  resetCircuitBreaker(): void;
}

export abstract class BaseAIAdapter implements AIAdapter {
  abstract readonly provider: AIProvider;
  abstract readonly model: string;

  protected config: AIAdapterConfig = {};
  protected initialized = false;
  protected circuitBreaker: CircuitBreaker;

  constructor(circuitBreakerConfig?: CircuitBreakerConfig) {
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
  }

  async initialize(config: AIAdapterConfig): Promise<void> {
    this.config = { timeout: 30000, maxRetries: 3, ...config };
    this.initialized = true;
  }

  abstract complete(request: AIRequest): Promise<AIResponse>;

  async stream(
    request: AIRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    throw new Error(`Streaming not supported for ${this.provider}`);
  }

  abstract getCapabilities(): ProviderCapabilities;

  abstract isHealthy(): Promise<boolean>;

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${this.provider} adapter not initialized`);
    }
    if (this.circuitBreaker.getState() === 'OPEN') {
      throw new Error(`${this.provider} circuit breaker is OPEN`);
    }
  }

  protected async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    const timeout = timeoutMs ?? this.config.timeout ?? 30000;
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Request timeout after ${timeout}ms`)),
          timeout
        )
      ),
    ]);
  }

  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}

export const PROVIDER_CAPABILITY_PROFILES: Record<
  AIProvider,
  ProviderCapabilities
> = {
  [AIProvider.CHATGPT]: {
    maxContextTokens: 128000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsVision: false,
    supportsJSON: true,
    supportsToolUse: true,
    latencyMs: 1500,
    costPer1kTokens: 0.01,
  },
  [AIProvider.CLAUDE]: {
    maxContextTokens: 200000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsJSON: true,
    supportsToolUse: true,
    latencyMs: 1800,
    costPer1kTokens: 0.015,
  },
  [AIProvider.GEMINI]: {
    maxContextTokens: 1000000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsJSON: true,
    supportsToolUse: true,
    latencyMs: 1200,
    costPer1kTokens: 0.005,
  },
  [AIProvider.PERPLEXITY]: {
    maxContextTokens: 128000,
    supportsStreaming: true,
    supportsFunctionCalling: false,
    supportsVision: false,
    supportsJSON: true,
    supportsToolUse: false,
    latencyMs: 2000,
    costPer1kTokens: 0.02,
  },
  [AIProvider.DETERMINISTIC]: {
    maxContextTokens: 0,
    supportsStreaming: false,
    supportsFunctionCalling: false,
    supportsVision: false,
    supportsJSON: false,
    supportsToolUse: false,
    latencyMs: 100,
    costPer1kTokens: 0,
  },
  [AIProvider.OPEN_SOURCE]: {
    maxContextTokens: 32768,
    supportsStreaming: true,
    supportsFunctionCalling: false,
    supportsVision: false,
    supportsJSON: true,
    supportsToolUse: false,
    latencyMs: 500,
    costPer1kTokens: 0,
  },
};

export function supportsCapability(
  provider: AIProvider,
  capability: keyof Omit<
    ProviderCapabilities,
    'maxContextTokens' | 'latencyMs' | 'costPer1kTokens'
  >
): boolean {
  const profile = PROVIDER_CAPABILITY_PROFILES[provider];
  return profile?.[capability] ?? false;
}
