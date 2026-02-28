import { AIProvider } from './AIIntentTypes';
import { IntentClassificationResult } from './AIIntentTypes';
import { AITaskRouter, TaskRouteResult } from './AITaskRouter';
import { AIAccountService } from './AIAccountService';
import { 
  RateLimiter, 
  FallbackDetector,
  IRateLimiter, 
  IFallbackDetector,
  RateLimitResult,
  FallbackTrigger,
  FallbackReason,
  RateLimitUsage,
} from './RateLimiter';

export interface RateLimitWithFallbackConfig {
  enableAutomaticFallback: boolean;
  maxConsecutiveFailures: number;
  fallbackTimeout: number;
  enableRateLimitRecovery: boolean;
}

export class RateLimitFallbackService {
  private rateLimiter: IRateLimiter;
  private fallbackDetector: IFallbackDetector;
  private accountService: AIAccountService;
  private taskRouter: AITaskRouter;
  private config: RateLimitWithFallbackConfig;
  private consecutiveFailures: Map<string, number> = new Map();

  constructor(
    rateLimiter: IRateLimiter,
    fallbackDetector: IFallbackDetector,
    accountService: AIAccountService,
    taskRouter: AITaskRouter,
    config?: Partial<RateLimitWithFallbackConfig>
  ) {
    this.rateLimiter = rateLimiter;
    this.fallbackDetector = fallbackDetector;
    this.accountService = accountService;
    this.taskRouter = taskRouter;
    this.config = {
      enableAutomaticFallback: true,
      maxConsecutiveFailures: 3,
      fallbackTimeout: 300000,
      enableRateLimitRecovery: true,
      ...config,
    };
  }

  async checkAndRoute(
    userId: string,
    intent: IntentClassificationResult
  ): Promise<{ route: TaskRouteResult; requiresFallback: boolean }> {
    const accountResult = await this.accountService.selectAccount({
      userId,
      preferredProvider: intent.recommendedProvider,
    });

    if (!accountResult.account) {
      return {
        route: this.taskRouter.route({ userId, intent }),
        requiresFallback: false,
      };
    }

    const rateCheck = await this.rateLimiter.checkLimit(
      accountResult.provider,
      userId,
      intent.estimatedComplexity === 'complex' ? 2000 : 500
    );

    if (!rateCheck.allowed) {
      const fallback = this.initiateFallback(userId, accountResult.provider, rateCheck);
      
      if (this.config.enableAutomaticFallback) {
        const fallbackRoute = await this.routeWithFallback(userId, intent);
        return { route: fallbackRoute, requiresFallback: true };
      }

      return {
        route: this.taskRouter.route({ 
          userId, 
          intent,
          userPreferences: { preferredProvider: AIProvider.OPEN_SOURCE },
        }),
        requiresFallback: true,
      };
    }

    return {
      route: this.taskRouter.route({ userId, intent }),
      requiresFallback: false,
    };
  }

  private async routeWithFallback(
    userId: string,
    intent: IntentClassificationResult
  ): Promise<TaskRouteResult> {
    const fallbackProviders = [AIProvider.OPEN_SOURCE];

    for (const provider of fallbackProviders) {
      const rateCheck = await this.rateLimiter.checkLimit(provider, userId);
      
      if (rateCheck.allowed) {
        const fallback: FallbackTrigger = {
          provider,
          reason: FallbackReason.RATE_LIMITED,
          triggeredAt: new Date(),
        };
        this.fallbackDetector.recordFallback(fallback);

        return this.taskRouter.route({
          userId,
          intent,
          userPreferences: { preferredProvider: provider },
        });
      }
    }

    return this.taskRouter.route({
      userId,
      intent,
      userPreferences: { preferredProvider: AIProvider.OPEN_SOURCE },
    });
  }

  private initiateFallback(
    userId: string,
    originalProvider: AIProvider,
    rateLimitResult: RateLimitResult
  ): FallbackTrigger {
    const key = `${userId}:${originalProvider}`;
    const failures = (this.consecutiveFailures.get(key) || 0) + 1;
    this.consecutiveFailures.set(key, failures);

    const fallback: FallbackTrigger = {
      provider: originalProvider,
      reason: FallbackReason.RATE_LIMITED,
      triggeredAt: new Date(),
    };

    this.fallbackDetector.recordFallback(fallback);
    
    if (failures >= this.config.maxConsecutiveFailures) {
      this.consecutiveFailures.set(key, 0);
    }

    return fallback;
  }

  async recordSuccess(provider: AIProvider, userId: string, tokens: number): Promise<void> {
    await this.rateLimiter.recordUsage(provider, userId, tokens);
    
    const key = `${userId}:${provider}`;
    this.consecutiveFailures.set(key, 0);
  }

  async recordFailure(error: any, provider: AIProvider, userId: string): Promise<void> {
    const fallback = this.fallbackDetector.detectFailure({
      ...error,
      provider,
    });

    if (fallback) {
      this.fallbackDetector.recordFallback(fallback);
      
      const key = `${userId}:${provider}`;
      const failures = (this.consecutiveFailures.get(key) || 0) + 1;
      this.consecutiveFailures.set(key, failures);
    }
  }

  getReliabilityScore(userId: string, provider: AIProvider): number {
    const providerScore = this.fallbackDetector.getProviderReliabilityScore(provider);
    const failureCount = this.consecutiveFailures.get(`${userId}:${provider}`) || 0;
    const failurePenalty = Math.min(failureCount * 0.2, 0.5);
    
    return Math.max(0, providerScore - failurePenalty);
  }

  shouldAttemptRecovery(userId: string, provider: AIProvider): boolean {
    const recentFallbacks = this.fallbackDetector.getRecentFallbacks(
      userId,
      new Date(Date.now() - this.config.fallbackTimeout)
    );

    const lastFallback = recentFallbacks.find((f: FallbackTrigger) => f.provider === provider);
    if (!lastFallback) return true;

    return this.fallbackDetector.shouldAttemptRecovery(lastFallback);
  }

  getRateLimitStatus(provider: AIProvider, userId: string): Promise<RateLimitUsage> {
    return this.rateLimiter.getUsage(provider, userId);
  }
}
