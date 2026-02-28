import { 
  AIProvider, 
  IRateLimiter, 
  RateLimitConfig, 
  RateLimitResult, 
  RateLimitUsage,
  RateLimitPolicy,
  IFallbackDetector,
  FallbackTrigger,
  FallbackReason,
} from './RateLimitTypes';

export { 
  IRateLimiter, 
  IFallbackDetector,
  RateLimitResult,
  FallbackTrigger,
  FallbackReason,
  RateLimitUsage,
} from './RateLimitTypes';

export class RateLimiter implements IRateLimiter {
  private usage: Map<string, RateLimitUsage> = new Map();
  private policies: Map<AIProvider, RateLimitConfig> = new Map();
  private defaultPolicy: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    tokensPerMinute: 150000,
    tokensPerDay: 1000000,
  };

  constructor(policies?: RateLimitPolicy[]) {
    if (policies) {
      for (const policy of policies) {
        this.policies.set(policy.provider, policy.limits);
      }
    }
  }

  private getKey(provider: AIProvider, userId: string): string {
    return `${provider}:${userId}`;
  }

  private getOrCreateUsage(provider: AIProvider, userId: string): RateLimitUsage {
    const key = this.getKey(provider, userId);
    let usage = this.usage.get(key);
    
    if (!usage) {
      const now = new Date();
      const windowReset = new Date(now.getTime() + 60000);
      const dayReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      
      usage = {
        requestsThisMinute: 0,
        requestsToday: 0,
        tokensThisMinute: 0,
        tokensToday: 0,
        windowResetsAt: windowReset,
        dayResetsAt: dayReset,
      };
      this.usage.set(key, usage);
    }

    this.pruneIfNeeded(usage);
    return usage;
  }

  private pruneIfNeeded(usage: RateLimitUsage): void {
    const now = new Date();
    
    if (now >= usage.windowResetsAt) {
      usage.requestsThisMinute = 0;
      usage.tokensThisMinute = 0;
      usage.windowResetsAt = new Date(now.getTime() + 60000);
    }
    
    if (now >= usage.dayResetsAt) {
      usage.requestsToday = 0;
      usage.tokensToday = 0;
      usage.dayResetsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    }
  }

  async checkLimit(provider: AIProvider, userId: string, tokens: number = 0): Promise<RateLimitResult> {
    const policy = this.policies.get(provider) || this.defaultPolicy;
    const usage = this.getOrCreateUsage(provider, userId);
    
    const requestsMinuteAllowed = usage.requestsThisMinute < policy.requestsPerMinute;
    const requestsDayAllowed = usage.requestsToday < policy.requestsPerDay;
    const tokensMinuteAllowed = usage.tokensThisMinute + tokens <= policy.tokensPerMinute;
    const tokensDayAllowed = usage.tokensToday + tokens <= policy.tokensPerDay;

    const now = new Date();
    let allowed = requestsMinuteAllowed && requestsDayAllowed && tokensMinuteAllowed && tokensDayAllowed;
    
    let remaining = Math.min(
      policy.requestsPerMinute - usage.requestsThisMinute,
      policy.requestsPerDay - usage.requestsToday
    );

    if (!allowed) {
      const retryAfter = Math.min(
        usage.windowResetsAt.getTime() - now.getTime(),
        usage.dayResetsAt.getTime() - now.getTime()
      );

      return {
        allowed: false,
        remaining: 0,
        resetAt: usage.windowResetsAt < usage.dayResetsAt ? usage.windowResetsAt : usage.dayResetsAt,
        retryAfter: Math.ceil(retryAfter / 1000),
        reason: !requestsMinuteAllowed ? 'Rate limit: requests per minute' :
                !requestsDayAllowed ? 'Rate limit: requests per day' :
                !tokensMinuteAllowed ? 'Rate limit: tokens per minute' :
                'Rate limit: tokens per day',
      };
    }

    return {
      allowed: true,
      remaining,
      resetAt: usage.windowResetsAt < usage.dayResetsAt ? usage.windowResetsAt : usage.dayResetsAt,
    };
  }

  async recordUsage(provider: AIProvider, userId: string, tokens: number): Promise<void> {
    const usage = this.getOrCreateUsage(provider, userId);
    usage.requestsThisMinute++;
    usage.requestsToday++;
    usage.tokensThisMinute += tokens;
    usage.tokensToday += tokens;
  }

  async getUsage(provider: AIProvider, userId: string): Promise<RateLimitUsage> {
    const usage = this.getOrCreateUsage(provider, userId);
    return { ...usage };
  }

  async reset(provider: AIProvider, userId: string): Promise<void> {
    const key = this.getKey(provider, userId);
    this.usage.delete(key);
  }
}

export class FallbackDetector implements IFallbackDetector {
  private fallbackHistory: FallbackTrigger[] = [];
  private maxHistory = 100;
  private recoveryTimeout = 300000;

  detectFailure(error: any): FallbackTrigger | null {
    const reason = this.mapErrorToReason(error);
    if (!reason) return null;

    return {
      provider: error.provider || AIProvider.CHATGPT,
      reason,
      triggeredAt: new Date(),
    };
  }

  private mapErrorToReason(error: any): FallbackReason | null {
    if (!error) return FallbackReason.SERVER_ERROR;

    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;

    if (status === 429 || message.includes('rate limit')) {
      return FallbackReason.RATE_LIMITED;
    }
    if (status === 401 || status === 403 || message.includes('invalid') || message.includes('unauthorized')) {
      return FallbackReason.INVALID_CREDENTIALS;
    }
    if (status === 503 || message.includes('maintenance')) {
      return FallbackReason.MAINTENANCE;
    }
    if (status >= 500) {
      return FallbackReason.SERVER_ERROR;
    }
    if (error.timeout || message.includes('timeout')) {
      return FallbackReason.TIMEOUT;
    }
    if (message.includes('network') || message.includes('fetch')) {
      return FallbackReason.NETWORK_ERROR;
    }
    if (message.includes('quota') || message.includes('limit')) {
      return FallbackReason.QUOTA_EXCEEDED;
    }

    return FallbackReason.SERVER_ERROR;
  }

  recordFallback(fallback: FallbackTrigger): void {
    this.fallbackHistory.push(fallback);
    if (this.fallbackHistory.length > this.maxHistory) {
      this.fallbackHistory.shift();
    }
  }

  getRecentFallbacks(userId: string, since: Date): FallbackTrigger[] {
    return this.fallbackHistory.filter(f => 
      f.triggeredAt >= since
    );
  }

  shouldAttemptRecovery(fallback: FallbackTrigger): boolean {
    if (fallback.isRecovered) return false;
    
    const timeSinceFailure = Date.now() - fallback.triggeredAt.getTime();
    return timeSinceFailure >= this.recoveryTimeout;
  }

  getProviderReliabilityScore(provider: AIProvider): number {
    const recent = this.fallbackHistory.filter(f => 
      f.provider === provider && 
      Date.now() - f.triggeredAt.getTime() < 3600000
    );
    
    if (recent.length === 0) return 1.0;
    return Math.max(0.1, 1.0 - (recent.length * 0.1));
  }
}
