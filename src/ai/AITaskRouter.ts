import {
  AIIntentType,
  AIProvider,
  TaskType,
  IntentClassification,
  IntentClassificationResult,
} from './AIIntentTypes';

export interface TaskRouteResult {
  route: 'deterministic' | 'ai_powered' | 'hybrid';
  primaryProvider: AIProvider;
  executionPlan?: ExecutionPlanStep[];
  requiresBrowser: boolean;
  requiresAPI: boolean;
  executionStrategy: 'direct' | 'queued' | 'streamed';
  priority: number;
  estimatedDuration: number;
  fallbackProviders: AIProvider[];
  routingReason: string;
  metadata?: {
    requiresWebAccess?: boolean;
    requiresLongContext?: boolean;
    requiresMultimodal?: boolean;
    isSearchQuery?: boolean;
  };
}

export interface ExecutionPlanStep {
  provider: AIProvider;
  action: string;
  strategy: 'direct' | 'queued' | 'streamed';
  dependsOn?: number;
}

export interface TaskRouterConfig {
  defaultPriority: number;
  deterministicTimeout: number;
  aiTimeout: number;
  enableHybridRouting: boolean;
  enableFallbackChain: boolean;
  browserAutomationEnabled: boolean;
}

export const DEFAULT_TASK_ROUTER_CONFIG: TaskRouterConfig = {
  defaultPriority: 5,
  deterministicTimeout: 30000,
  aiTimeout: 120000,
  enableHybridRouting: true,
  enableFallbackChain: true,
  browserAutomationEnabled: true,
};

export interface RouteContext {
  userId: string;
  intent: IntentClassificationResult;
  userPreferences?: {
    preferredProvider?: AIProvider;
    allowBrowserAutomation?: boolean;
    maxCostTier?: 'free' | 'standard' | 'premium';
  };
  availableProviders?: Set<AIProvider>;
  availableAccounts?: Map<AIProvider, string[]>;
  providerHealthService?: IProviderHealthService;
}

export interface IProviderHealthService {
  isHealthy(provider: AIProvider): boolean;
  getLatencyScore(provider: AIProvider): number;
  getReliabilityScore(provider: AIProvider): number;
}

export class AITaskRouter {
  private config: TaskRouterConfig;

  constructor(config: Partial<TaskRouterConfig> = {}) {
    this.config = { ...DEFAULT_TASK_ROUTER_CONFIG, ...config };
  }

  route(context: RouteContext): TaskRouteResult {
    const { intent, userPreferences } = context;
    
    const classification = intent.classification;

    if (classification === IntentClassification.DETERMINISTIC) {
      return this.routeDeterministic(intent, userPreferences, context);
    }

    if (classification === IntentClassification.HYBRID && this.config.enableHybridRouting) {
      return this.routeHybrid(intent, userPreferences, context);
    }

    return this.routeAIPowered(intent, userPreferences, context);
  }

  private routeDeterministic(
    intent: IntentClassificationResult,
    userPreferences?: RouteContext['userPreferences'],
    context?: RouteContext
  ): TaskRouteResult {
    const requiresBrowser = [
      AIIntentType.NAVIGATE_URL,
      AIIntentType.DETERMINISTIC_AUTOMATION,
      AIIntentType.FORM_FILLING,
      AIIntentType.SCREEN_SCRAPE,
    ].includes(intent.intent);

    let executionStrategy: TaskRouteResult['executionStrategy'] = 'direct';
    if (intent.intent === AIIntentType.NAVIGATE_URL || 
        intent.intent === AIIntentType.SCREEN_SCRAPE) {
      executionStrategy = 'queued';
    }

    return {
      route: 'deterministic',
      primaryProvider: AIProvider.DETERMINISTIC,
      requiresBrowser: requiresBrowser && this.config.browserAutomationEnabled,
      requiresAPI: false,
      executionStrategy,
      priority: this.determinePriority(intent),
      estimatedDuration: this.estimateDeterministicDuration(intent),
      fallbackProviders: this.getDeterministicFallbacks(),
      routingReason: `Intent '${intent.intent}' classified as deterministic automation`,
      metadata: {
        requiresWebAccess: intent.requiresWebAccess,
      },
    };
  }

  private routeHybrid(
    intent: IntentClassificationResult,
    userPreferences?: RouteContext['userPreferences'],
    context?: RouteContext
  ): TaskRouteResult {
    const hasWebEntities = intent.entities.length > 0 && intent.entities.some(e => e.type === 'url');
    
    const primaryProvider = hasWebEntities 
      ? AIProvider.DETERMINISTIC 
      : AIProvider.CHATGPT;

    const executionPlan: ExecutionPlanStep[] = hasWebEntities
      ? [
          { provider: AIProvider.DETERMINISTIC, action: 'fetch', strategy: 'queued', dependsOn: undefined },
          { provider: AIProvider.CHATGPT, action: 'process', strategy: 'streamed', dependsOn: 0 },
        ]
      : [
          { provider: AIProvider.CHATGPT, action: 'assist', strategy: 'direct' },
        ];

    return {
      route: 'hybrid',
      primaryProvider,
      executionPlan,
      requiresBrowser: hasWebEntities,
      requiresAPI: true,
      executionStrategy: hasWebEntities ? 'queued' : 'direct',
      priority: this.determinePriority(intent),
      estimatedDuration: 45000,
      fallbackProviders: this.getHybridFallbacks(primaryProvider),
      routingReason: `Intent '${intent.intent}' requires hybrid execution (${hasWebEntities ? 'web access + AI' : 'AI assistance'})`,
      metadata: {
        requiresWebAccess: intent.requiresWebAccess,
        isSearchQuery: intent.intent === AIIntentType.EXTRACT_INFO && hasWebEntities,
      },
    };
  }

  private routeAIPowered(
    intent: IntentClassificationResult,
    userPreferences?: RouteContext['userPreferences'],
    context?: RouteContext
  ): TaskRouteResult {
    const preferredProvider = userPreferences?.preferredProvider ?? intent.recommendedProvider;
    const provider = this.resolveAvailableProvider(preferredProvider, context);
    
    let executionStrategy: TaskRouteResult['executionStrategy'] = 'direct';
    if (intent.taskType === TaskType.ANALYSIS || 
        intent.estimatedComplexity === 'complex') {
      executionStrategy = 'queued';
    }

    const requiresLongContext = [
      AIIntentType.SUMMARIZE_CONTENT,
      AIIntentType.EXPAND_CONTENT,
      AIIntentType.ANALYZE_DATA,
    ].includes(intent.intent);

    const isSearchQuery = [
      AIIntentType.EXTRACT_INFO,
      AIIntentType.COMPARE_ITEMS,
    ].includes(intent.intent);

    return {
      route: 'ai_powered',
      primaryProvider: provider,
      requiresBrowser: false,
      requiresAPI: true,
      executionStrategy,
      priority: this.determinePriority(intent),
      estimatedDuration: this.estimateAIDuration(intent),
      fallbackProviders: this.getAIFallbacks(provider, context),
      routingReason: `Intent '${intent.intent}' requires AI-powered processing`,
      metadata: {
        requiresLongContext,
        isSearchQuery,
      },
    };
  }

  private resolveAvailableProvider(
    primary: AIProvider,
    context?: RouteContext
  ): AIProvider {
    const freeTier = context?.userPreferences?.maxCostTier === 'free';

    if (freeTier) {
      return AIProvider.OPEN_SOURCE;
    }

    if (!context) {
      return primary;
    }

    const { availableProviders, providerHealthService } = context;
    const hasProviderAvailabilityCheck = availableProviders !== undefined;

    if (!hasProviderAvailabilityCheck) {
      return primary;
    }

    if (availableProviders.has(primary) && 
        (!providerHealthService || providerHealthService.isHealthy(primary))) {
      return primary;
    }

    const fallbacks = this.getAIFallbacks(primary, context);
    for (const fallback of fallbacks) {
      if (availableProviders.has(fallback) && 
          (!providerHealthService || providerHealthService.isHealthy(fallback))) {
        return fallback;
      }
    }

    return AIProvider.OPEN_SOURCE;
  }

  private rankProviders(
    intent: IntentClassificationResult,
    context?: RouteContext
  ): AIProvider[] {
    const candidates = [
      AIProvider.CHATGPT,
      AIProvider.CLAUDE,
      AIProvider.GEMINI,
      AIProvider.PERPLEXITY,
    ];

    if (!context?.providerHealthService) {
      return candidates;
    }

    return candidates.sort((a, b) => {
      const healthScoreA = context.providerHealthService!.getReliabilityScore(a);
      const healthScoreB = context.providerHealthService!.getReliabilityScore(b);
      return healthScoreB - healthScoreA;
    });
  }

  private determinePriority(intent: IntentClassificationResult): number {
    // Higher number = higher execution priority (processed first)
    // Priority range: 1-10, where 10 is most urgent
    if (intent.taskType === TaskType.AUTOMATION) {
      return 8;
    }

    if (intent.estimatedComplexity === 'complex') {
      return 3;
    }

    if (intent.estimatedComplexity === 'simple') {
      return 7;
    }

    return this.config.defaultPriority;
  }

  private estimateDeterministicDuration(intent: IntentClassificationResult): number {
    const baseDurations: Partial<Record<AIIntentType, number>> = {
      [AIIntentType.NAVIGATE_URL]: 15000,
      [AIIntentType.FORM_FILLING]: 10000,
      [AIIntentType.DATA_ENTRY]: 5000,
      [AIIntentType.DETERMINISTIC_AUTOMATION]: 20000,
      [AIIntentType.SCREEN_SCRAPE]: 25000,
      [AIIntentType.API_INTEGRATION]: 10000,
    };

    return baseDurations[intent.intent] ?? 10000;
  }

  private estimateAIDuration(intent: IntentClassificationResult): number {
    const complexityMultipliers = {
      simple: 1,
      moderate: 1.5,
      complex: 2.5,
    };

    const baseDurations: Partial<Record<TaskType, number>> = {
      [TaskType.GENERATION]: 15000,
      [TaskType.ANALYSIS]: 30000,
      [TaskType.AUTOMATION]: 20000,
    };

    const baseDuration = baseDurations[intent.taskType] ?? 15000;
    const multiplier = complexityMultipliers[intent.estimatedComplexity] ?? 1;

    return Math.round(baseDuration * multiplier);
  }

  private getDeterministicFallbacks(): AIProvider[] {
    return [];
  }

  private getHybridFallbacks(primary: AIProvider): AIProvider[] {
    if (primary === AIProvider.DETERMINISTIC) {
      return [AIProvider.CHATGPT, AIProvider.CLAUDE];
    }
    return [AIProvider.DETERMINISTIC];
  }

  private getAIFallbacks(primary: AIProvider, context?: RouteContext): AIProvider[] {
    const freeTier = context?.userPreferences?.maxCostTier === 'free';
    
    if (freeTier) {
      return [AIProvider.OPEN_SOURCE];
    }

    const fallbackOrder: Record<AIProvider, AIProvider[]> = {
      [AIProvider.CHATGPT]: [AIProvider.OPEN_SOURCE, AIProvider.CLAUDE, AIProvider.GEMINI],
      [AIProvider.CLAUDE]: [AIProvider.OPEN_SOURCE, AIProvider.CHATGPT, AIProvider.GEMINI],
      [AIProvider.GEMINI]: [AIProvider.OPEN_SOURCE, AIProvider.CHATGPT, AIProvider.CLAUDE],
      [AIProvider.PERPLEXITY]: [AIProvider.OPEN_SOURCE, AIProvider.CHATGPT, AIProvider.CLAUDE],
      [AIProvider.DETERMINISTIC]: [],
      [AIProvider.OPEN_SOURCE]: [],
    };

    return fallbackOrder[primary] || [AIProvider.OPEN_SOURCE];
  }

  routeBatch(contexts: RouteContext[]): TaskRouteResult[] {
    return contexts.map((context) => this.route(context));
  }

  updateConfig(config: Partial<TaskRouterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TaskRouterConfig {
    return { ...this.config };
  }
}

export function createTaskRouter(config?: Partial<TaskRouterConfig>): AITaskRouter {
  return new AITaskRouter(config);
}
