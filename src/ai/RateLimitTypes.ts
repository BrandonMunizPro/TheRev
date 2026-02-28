import { AIProvider } from './AIIntentTypes';

export { AIProvider } from './AIIntentTypes';

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
}

export interface RateLimitUsage {
  requestsThisMinute: number;
  requestsToday: number;
  tokensThisMinute: number;
  tokensToday: number;
  windowResetsAt: Date;
  dayResetsAt: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
  reason?: string;
}

export interface FallbackTrigger {
  provider: AIProvider;
  reason: FallbackReason;
  triggeredAt: Date;
  previousProvider?: AIProvider;
  isRecovered?: boolean;
}

export enum FallbackReason {
  RATE_LIMITED = 'rate_limited',
  INVALID_CREDENTIALS = 'invalid_credentials',
  TIMEOUT = 'timeout',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
  MAINTENANCE = 'maintenance',
  QUOTA_EXCEEDED = 'quota_exceeded',
}

export interface IRateLimiter {
  checkLimit(provider: AIProvider, userId: string, tokens?: number): Promise<RateLimitResult>;
  recordUsage(provider: AIProvider, userId: string, tokens: number): Promise<void>;
  getUsage(provider: AIProvider, userId: string): Promise<RateLimitUsage>;
  reset(provider: AIProvider, userId: string): Promise<void>;
}

export interface IFallbackDetector {
  detectFailure(error: any): FallbackTrigger | null;
  recordFallback(fallback: FallbackTrigger): void;
  getRecentFallbacks(userId: string, since: Date): FallbackTrigger[];
  shouldAttemptRecovery(fallback: FallbackTrigger): boolean;
  getProviderReliabilityScore(provider: AIProvider): number;
}

export interface RateLimitPolicy {
  provider: AIProvider;
  limits: RateLimitConfig;
  isGlobal: boolean;
  priority: number;
}
