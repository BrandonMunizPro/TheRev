import { AIProvider } from './AIIntentTypes';
import {
  UserAIAccount,
  AccountSelectionContext,
  AccountSelectionResult,
  AIAccountStatus,
  IAIAccountRepository,
  IAccountHealthChecker,
  RateLimitStatus,
} from './AIAccountTypes';

export { AIProvider };

export class AIAccountService {
  private repository: IAIAccountRepository;
  private healthChecker: IAccountHealthChecker;
  private healthCheckCache: Map<string, { healthy: boolean; checkedAt: Date }> = new Map();
  private healthCheckTTL = 60000;

  constructor(repository: IAIAccountRepository, healthChecker: IAccountHealthChecker) {
    this.repository = repository;
    this.healthChecker = healthChecker;
  }

  async selectAccount(context: AccountSelectionContext): Promise<AccountSelectionResult> {
    const accounts = await this.repository.findByUserId(context.userId);
    
    if (accounts.length === 0) {
      return {
        account: null,
        provider: AIProvider.OPEN_SOURCE,
        fallbackAvailable: false,
        selectionReason: 'No AI accounts configured, using local fallback',
        isHealthy: true,
      };
    }

    const activeAccounts = accounts.filter(a => 
      a.status === AIAccountStatus.ACTIVE || a.status === AIAccountStatus.RATE_LIMITED
    );

    if (activeAccounts.length === 0) {
      return {
        account: null,
        provider: AIProvider.OPEN_SOURCE,
        fallbackAvailable: false,
        selectionReason: 'All accounts inactive or suspended',
        isHealthy: false,
      };
    }

    if (context.preferredProvider) {
      const preferred = await this.findBestAccount(
        activeAccounts,
        context.preferredProvider,
        context.requiredCapabilities
      );
      
      if (preferred) {
        return this.createSelectionResult(preferred, `Preferred provider: ${context.preferredProvider}`);
      }
    }

    const sortedByPriority = this.sortByPriority(activeAccounts, context.priority || 'quality');
    
    for (const account of sortedByPriority) {
      const isHealthy = await this.checkHealth(account);
      const rateLimit = await this.healthChecker.getRateLimitStatus(account);
      
      if (isHealthy && !rateLimit.isLimited) {
        return this.createSelectionResult(account, `Best available: ${account.provider}`, rateLimit);
      }
    }

    return {
      account: null,
      provider: AIProvider.OPEN_SOURCE,
      fallbackAvailable: true,
      selectionReason: 'All configured accounts at capacity, using local fallback',
      isHealthy: false,
    };
  }

  private async findBestAccount(
    accounts: UserAIAccount[],
    preferredProvider: AIProvider,
    requiredCapabilities?: string[]
  ): Promise<UserAIAccount | null> {
    const matches = accounts.filter(a => a.provider === preferredProvider);
    
    if (matches.length === 0) return null;

    if (requiredCapabilities && requiredCapabilities.length > 0) {
      const withCapabilities = matches.filter(a => 
        requiredCapabilities.every(cap => a.metadata.model?.includes(cap) || true)
      );
      if (withCapabilities.length > 0) {
        return this.sortByPriority(withCapabilities, 'quality')[0];
      }
    }

    return this.sortByPriority(matches, 'quality')[0];
  }

  private sortByPriority(accounts: UserAIAccount[], priority: 'speed' | 'quality' | 'cost'): UserAIAccount[] {
    return [...accounts].sort((a, b) => {
      if (priority === 'speed') {
        const aTime = a.metadata.lastUsedAt?.getTime() ?? 0;
        const bTime = b.metadata.lastUsedAt?.getTime() ?? 0;
        return aTime - bTime;
      }
      if (priority === 'cost') {
        return a.priority - b.priority;
      }
      return b.priority - a.priority;
    });
  }

  private async checkHealth(account: UserAIAccount): Promise<boolean> {
    const cacheKey = account.id;
    const cached = this.healthCheckCache.get(cacheKey);
    
    if (cached && Date.now() - cached.checkedAt.getTime() < this.healthCheckTTL) {
      return cached.healthy;
    }

    const healthy = await this.healthChecker.checkHealth(account);
    this.healthCheckCache.set(cacheKey, { healthy, checkedAt: new Date() });
    
    if (!healthy) {
      await this.repository.updateStatus(account.id, AIAccountStatus.RATE_LIMITED);
    }
    
    return healthy;
  }

  private createSelectionResult(
    account: UserAIAccount, 
    reason: string,
    rateLimit?: RateLimitStatus
  ): AccountSelectionResult {
    return {
      account,
      provider: account.provider,
      fallbackAvailable: true,
      selectionReason: reason,
      isHealthy: account.status === AIAccountStatus.ACTIVE,
      rateLimitRemaining: rateLimit?.remaining,
    };
  }

  async validateAndRefreshAccounts(userId: string): Promise<{ valid: UserAIAccount[]; invalid: string[] }> {
    const accounts = await this.repository.findByUserId(userId);
    const valid: UserAIAccount[] = [];
    const invalid: string[] = [];

    for (const account of accounts) {
      const isValid = await this.healthChecker.validateCredentials(account);
      
      if (isValid) {
        valid.push(account);
      } else {
        invalid.push(account.id);
        await this.repository.updateStatus(account.id, AIAccountStatus.INVALID_CREDENTIALS);
      }
    }

    return { valid, invalid };
  }

  clearHealthCache(): void {
    this.healthCheckCache.clear();
  }
}

export interface AIAccountRepository {
  findByUserId(userId: string): Promise<UserAIAccount[]>;
  findById(accountId: string): Promise<UserAIAccount | null>;
  findDefault(userId: string): Promise<UserAIAccount | null>;
  findHealthyByProvider(userId: string, provider: AIProvider): Promise<UserAIAccount[]>;
  save(account: UserAIAccount): Promise<void>;
  updateStatus(accountId: string, status: AIAccountStatus): Promise<void>;
  delete(accountId: string): Promise<void>;
  incrementUsage(accountId: string, tokens: number): Promise<void>;
}
