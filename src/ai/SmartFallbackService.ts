import { AIProvider } from './AIIntentTypes';
import { adapterFactory, AdapterHealth } from './adapters';
import { CircuitState } from './adapters/CircuitBreaker';

export interface RoutingStrategy {
  type: 'latency' | 'cost' | 'capability' | 'health-weighted' | 'priority';
  preferredProviders?: AIProvider[];
}

export interface FallbackChain {
  primary: AIProvider;
  fallbacks: AIProvider[];
}

export class SmartFallbackService {
  private defaultChains: Map<AIProvider, AIProvider[]> = new Map([
    [AIProvider.CHATGPT, [AIProvider.CHATGPT, AIProvider.CLAUDE, AIProvider.GEMINI, AIProvider.OPEN_SOURCE, AIProvider.DETERMINISTIC]],
    [AIProvider.CLAUDE, [AIProvider.CLAUDE, AIProvider.CHATGPT, AIProvider.GEMINI, AIProvider.OPEN_SOURCE, AIProvider.DETERMINISTIC]],
    [AIProvider.GEMINI, [AIProvider.GEMINI, AIProvider.CHATGPT, AIProvider.CLAUDE, AIProvider.OPEN_SOURCE, AIProvider.DETERMINISTIC]],
    [AIProvider.PERPLEXITY, [AIProvider.PERPLEXITY, AIProvider.CHATGPT, AIProvider.GEMINI, AIProvider.OPEN_SOURCE, AIProvider.DETERMINISTIC]],
    [AIProvider.OPEN_SOURCE, [AIProvider.OPEN_SOURCE, AIProvider.DETERMINISTIC]],
    [AIProvider.DETERMINISTIC, [AIProvider.DETERMINISTIC]],
  ]);

  getFallbackChain(preferred: AIProvider): FallbackChain {
    const fallbacks = this.defaultChains.get(preferred) || [preferred, AIProvider.DETERMINISTIC];
    return {
      primary: preferred,
      fallbacks,
    };
  }

  getBestAvailableProvider(
    preferred: AIProvider,
    requiredCapabilities?: Set<string>,
    strategy: RoutingStrategy['type'] = 'health-weighted'
  ): AIProvider | null {
    const chain = this.getFallbackChain(preferred);
    const allProviders = [chain.primary, ...chain.fallbacks];

    const available = allProviders.filter(provider => {
      const health = adapterFactory.getHealthStatus(provider);
      if (!health || !health.isHealthy) return false;
      if (health.circuitState === CircuitState.OPEN) return false;
      
      if (requiredCapabilities) {
        const caps = adapterFactory.getProviderCapabilities(provider);
        if (!caps) return false;
        for (const cap of requiredCapabilities) {
          if (!caps[cap as keyof typeof caps]) return false;
        }
      }
      return true;
    });

    if (available.length === 0) {
      return AIProvider.DETERMINISTIC;
    }

    switch (strategy) {
      case 'latency':
        return this.selectByLatency(available);
      case 'cost':
        return this.selectByCost(available);
      case 'capability':
        return this.selectByCapability(available, requiredCapabilities);
      case 'health-weighted':
      default:
        return this.selectByHealth(available);
    }
  }

  private selectByLatency(providers: AIProvider[]): AIProvider {
    const withLatency = providers.map(p => ({
      provider: p,
      latency: adapterFactory.getHealthStatus(p)?.latencyMs ?? Infinity,
    }));
    withLatency.sort((a, b) => a.latency - b.latency);
    return withLatency[0].provider;
  }

  private selectByCost(providers: AIProvider[]): AIProvider {
    const withCost = providers.map(p => ({
      provider: p,
      cost: adapterFactory.getProviderCapabilities(p)?.costPer1kTokens ?? Infinity,
    }));
    withCost.sort((a, b) => a.cost - b.cost);
    return withCost[0].provider;
  }

  private selectByCapability(providers: AIProvider[], required?: Set<string>): AIProvider {
    if (!required || required.size === 0) {
      return providers[0];
    }
    const scored = providers.map(p => {
      const caps = adapterFactory.getProviderCapabilities(p);
      if (!caps) return { provider: p, score: 0 };
      let score = 0;
      for (const cap of required) {
        if (caps[cap as keyof typeof caps]) score++;
      }
      return { provider: p, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].provider;
  }

  private selectByHealth(providers: AIProvider[]): AIProvider {
    const withHealth = providers.map(p => ({
      provider: p,
      health: adapterFactory.getHealthStatus(p),
    }));
    withHealth.sort((a, b) => {
      const aScore = (a.health?.isHealthy ? 10 : 0) - (a.health?.latencyMs ?? 10000) / 1000;
      const bScore = (b.health?.isHealthy ? 10 : 0) - (b.health?.latencyMs ?? 10000) / 1000;
      return bScore - aScore;
    });
    return withHealth[0].provider;
  }

  getAllAvailableWithFallback(): Array<{ provider: AIProvider; isAvailable: boolean; reason?: string }> {
    const all = Object.values(AIProvider) as AIProvider[];
    return all.map(provider => {
      const health = adapterFactory.getHealthStatus(provider);
      const chain = this.getFallbackChain(provider);
      
      if (health?.isHealthy && health.circuitState !== CircuitState.OPEN) {
        return { provider, isAvailable: true };
      }

      const fallback = chain.fallbacks.find(f => {
        const fh = adapterFactory.getHealthStatus(f);
        return fh?.isHealthy && fh.circuitState !== CircuitState.OPEN;
      });

      return {
        provider,
        isAvailable: false,
        reason: fallback ? `Would fallback to ${fallback}` : 'No fallback available',
      };
    });
  }
}

export const smartFallbackService = new SmartFallbackService();
