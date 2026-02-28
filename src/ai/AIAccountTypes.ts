import { AIProvider } from './AIIntentTypes';
import type { RateLimitConfig } from './RateLimitTypes';

export { AIProvider } from './AIIntentTypes';
export type { RateLimitConfig };

export interface UserAIAccount {
  id: string;
  userId: string;
  provider: AIProvider;
  displayName: string;
  isDefault: boolean;
  priority: number;
  status: AIAccountStatus;
  rateLimit: RateLimitConfig;
  metadata: AccountMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export enum AIAccountStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  RATE_LIMITED = 'rate_limited',
  INVALID_CREDENTIALS = 'invalid_credentials',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export interface AccountMetadata {
  model?: string;
  lastUsedAt?: Date;
  totalRequests: number;
  totalTokens: number;
  consecutiveFailures: number;
  lastHealthCheck?: Date;
}

export interface AccountSelectionContext {
  userId: string;
  preferredProvider?: AIProvider;
  preferredModels?: string[];
  requiredCapabilities?: string[];
  priority?: 'speed' | 'quality' | 'cost';
  excludeProviders?: AIProvider[];
}

export interface AccountSelectionResult {
  account: UserAIAccount | null;
  provider: AIProvider;
  fallbackAvailable: boolean;
  selectionReason: string;
  isHealthy: boolean;
  rateLimitRemaining?: number;
}

export interface IAIAccountRepository {
  findByUserId(userId: string): Promise<UserAIAccount[]>;
  findById(accountId: string): Promise<UserAIAccount | null>;
  findDefault(userId: string): Promise<UserAIAccount | null>;
  findHealthyByProvider(userId: string, provider: AIProvider): Promise<UserAIAccount[]>;
  save(account: UserAIAccount): Promise<void>;
  updateStatus(accountId: string, status: AIAccountStatus): Promise<void>;
  delete(accountId: string): Promise<void>;
  incrementUsage(accountId: string, tokens: number): Promise<void>;
}

export interface IAccountHealthChecker {
  checkHealth(account: UserAIAccount): Promise<boolean>;
  validateCredentials(account: UserAIAccount): Promise<boolean>;
  getRateLimitStatus(account: UserAIAccount): Promise<RateLimitStatus>;
}

export interface RateLimitStatus {
  remaining: number;
  resetAt: Date;
  isLimited: boolean;
}
