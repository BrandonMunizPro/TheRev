import { AITaskRouter } from '../../ai/AITaskRouter';
import {
  AIIntentType,
  AIProvider,
  IntentClassification,
  TaskType,
  IntentClassificationResult,
} from '../../ai/AIIntentTypes';

const createMockIntent = (
  intent: AIIntentType,
  classification: IntentClassification,
  taskType: TaskType,
  recommendedProvider: AIProvider = AIProvider.CHATGPT,
  entities: { type: string; value: string }[] = [],
  estimatedComplexity: 'simple' | 'moderate' | 'complex' = 'moderate'
): IntentClassificationResult => ({
  intent,
  confidence: 0.9,
  classification,
  taskType,
  recommendedProvider,
  parameters: [],
  entities: entities as any,
  requiresReasoning: classification !== IntentClassification.DETERMINISTIC,
  requiresWebAccess: false,
  estimatedComplexity,
  fallbackIntents: [],
  rawInput: 'test input',
});

describe('AITaskRouter', () => {
  let router: AITaskRouter;

  beforeEach(() => {
    router = new AITaskRouter();
  });

  describe('Deterministic Routing', () => {
    it('should route NAVIGATE_URL to deterministic with browser', () => {
      const intent = createMockIntent(
        AIIntentType.NAVIGATE_URL,
        IntentClassification.DETERMINISTIC,
        TaskType.AUTOMATION
      );

      const result = router.route({
        userId: 'user-1',
        intent,
      });

      expect(result.route).toBe('deterministic');
      expect(result.primaryProvider).toBe(AIProvider.DETERMINISTIC);
      expect(result.requiresBrowser).toBe(true);
      expect(result.executionStrategy).toBe('queued');
    });

    it('should route FORM_FILLING to deterministic', () => {
      const intent = createMockIntent(
        AIIntentType.FORM_FILLING,
        IntentClassification.DETERMINISTIC,
        TaskType.AUTOMATION
      );

      const result = router.route({
        userId: 'user-1',
        intent,
      });

      expect(result.route).toBe('deterministic');
      expect(result.primaryProvider).toBe(AIProvider.DETERMINISTIC);
      expect(result.requiresBrowser).toBe(true);
    });

    it('should route SCREEN_SCRAPE to queued execution', () => {
      const intent = createMockIntent(
        AIIntentType.SCREEN_SCRAPE,
        IntentClassification.DETERMINISTIC,
        TaskType.AUTOMATION
      );

      const result = router.route({
        userId: 'user-1',
        intent,
      });

      expect(result.executionStrategy).toBe('queued');
      expect(result.estimatedDuration).toBe(25000);
    });
  });

  describe('Hybrid Routing', () => {
    it('should create execution plan for hybrid with URL entities', () => {
      const intent = createMockIntent(
        AIIntentType.EXTRACT_INFO,
        IntentClassification.HYBRID,
        TaskType.ANALYSIS,
        AIProvider.PERPLEXITY,
        [{ type: 'url', value: 'https://example.com' }]
      );

      const result = router.route({
        userId: 'user-1',
        intent,
      });

      expect(result.route).toBe('hybrid');
      expect(result.executionPlan).toBeDefined();
      expect(result.executionPlan).toHaveLength(2);
      expect(result.executionPlan?.[0].provider).toBe(AIProvider.DETERMINISTIC);
      expect(result.executionPlan?.[0].action).toBe('fetch');
      expect(result.executionPlan?.[1].provider).toBe(AIProvider.CHATGPT);
      expect(result.executionPlan?.[1].action).toBe('process');
    });

    it('should route hybrid without URLs to direct AI', () => {
      const intent = createMockIntent(
        AIIntentType.EXTRACT_INFO,
        IntentClassification.HYBRID,
        TaskType.ANALYSIS,
        AIProvider.PERPLEXITY,
        []
      );

      const result = router.route({
        userId: 'user-1',
        intent,
      });

      expect(result.route).toBe('hybrid');
      expect(result.executionStrategy).toBe('direct');
      expect(result.executionPlan).toHaveLength(1);
    });
  });

  describe('AI-Powered Routing', () => {
    it('should route generation tasks to preferred provider', () => {
      const intent = createMockIntent(
        AIIntentType.WRITE_POST,
        IntentClassification.AI_POWERED,
        TaskType.GENERATION,
        AIProvider.CHATGPT
      );

      const result = router.route({
        userId: 'user-1',
        intent,
        userPreferences: {
          preferredProvider: AIProvider.CLAUDE,
        },
      });

      expect(result.route).toBe('ai_powered');
      expect(result.primaryProvider).toBe(AIProvider.CLAUDE);
    });

    it('should use recommended provider when no preference', () => {
      const intent = createMockIntent(
        AIIntentType.SUMMARIZE_CONTENT,
        IntentClassification.AI_POWERED,
        TaskType.ANALYSIS,
        AIProvider.CLAUDE
      );

      const result = router.route({
        userId: 'user-1',
        intent,
      });

      expect(result.primaryProvider).toBe(AIProvider.CLAUDE);
    });

    it('should queue complex analysis tasks', () => {
      const intent = createMockIntent(
        AIIntentType.ANALYZE_DATA,
        IntentClassification.AI_POWERED,
        TaskType.ANALYSIS,
        AIProvider.CLAUDE,
        [],
        'complex'
      );

      const result = router.route({
        userId: 'user-1',
        intent,
      });

      expect(result.executionStrategy).toBe('queued');
    });
  });

  describe('Provider Availability', () => {
    it('should fallback when preferred provider unavailable', () => {
      const intent = createMockIntent(
        AIIntentType.WRITE_POST,
        IntentClassification.AI_POWERED,
        TaskType.GENERATION,
        AIProvider.CHATGPT
      );

      const result = router.route({
        userId: 'user-1',
        intent,
        availableProviders: new Set([AIProvider.CLAUDE]),
      });

      expect(result.primaryProvider).toBe(AIProvider.CLAUDE);
    });

    it('should fallback to open source when all preferred unavailable', () => {
      const intent = createMockIntent(
        AIIntentType.WRITE_POST,
        IntentClassification.AI_POWERED,
        TaskType.GENERATION,
        AIProvider.CHATGPT
      );

      const result = router.route({
        userId: 'user-1',
        intent,
        availableProviders: new Set([]),
      });

      expect(result.primaryProvider).toBe(AIProvider.OPEN_SOURCE);
    });
  });

  describe('Provider Health Service', () => {
    it('should check provider health before routing', () => {
      const mockHealthService = {
        isHealthy: (provider: AIProvider) => provider !== AIProvider.CHATGPT,
        getLatencyScore: () => 100,
        getReliabilityScore: () => 0.9,
      };

      const intent = createMockIntent(
        AIIntentType.WRITE_POST,
        IntentClassification.AI_POWERED,
        TaskType.GENERATION,
        AIProvider.CHATGPT
      );

      const result = router.route({
        userId: 'user-1',
        intent,
        availableProviders: new Set([AIProvider.CHATGPT, AIProvider.CLAUDE]),
        providerHealthService: mockHealthService,
      });

      expect(result.primaryProvider).toBe(AIProvider.CLAUDE);
    });
  });

  describe('Cost Tier Filtering', () => {
    it('should filter out premium providers for free tier', () => {
      const intent = createMockIntent(
        AIIntentType.WRITE_POST,
        IntentClassification.AI_POWERED,
        TaskType.GENERATION,
        AIProvider.CHATGPT
      );

      const result = router.route({
        userId: 'user-1',
        intent,
        userPreferences: {
          maxCostTier: 'free',
        },
      });

      expect(result.fallbackProviders).not.toContain(AIProvider.CLAUDE);
    });

    it('should include all providers for premium tier', () => {
      const intent = createMockIntent(
        AIIntentType.WRITE_POST,
        IntentClassification.AI_POWERED,
        TaskType.GENERATION,
        AIProvider.CHATGPT
      );

      const result = router.route({
        userId: 'user-1',
        intent,
        userPreferences: {
          maxCostTier: 'premium',
        },
      });

      expect(result.fallbackProviders).toContain(AIProvider.CLAUDE);
    });
  });

  describe('Priority Assignment', () => {
    it('should assign high priority to automation tasks', () => {
      const intent = createMockIntent(
        AIIntentType.NAVIGATE_URL,
        IntentClassification.DETERMINISTIC,
        TaskType.AUTOMATION
      );

      const result = router.route({ userId: 'user-1', intent });
      expect(result.priority).toBe(8);
    });

    it('should assign low priority to complex tasks', () => {
      const intent = createMockIntent(
        AIIntentType.ANALYZE_DATA,
        IntentClassification.AI_POWERED,
        TaskType.ANALYSIS,
        AIProvider.CLAUDE,
        [],
        'complex'
      );

      const result = router.route({ userId: 'user-1', intent });
      expect(result.priority).toBe(3);
    });

    it('should assign default priority to moderate tasks', () => {
      const intent = createMockIntent(
        AIIntentType.WRITE_POST,
        IntentClassification.AI_POWERED,
        TaskType.GENERATION,
        AIProvider.CHATGPT,
        [],
        'moderate'
      );

      const result = router.route({ userId: 'user-1', intent });
      expect(result.priority).toBe(5);
    });
  });

  describe('Duration Estimation', () => {
    it('should estimate deterministic durations correctly', () => {
      const intent = createMockIntent(
        AIIntentType.FORM_FILLING,
        IntentClassification.DETERMINISTIC,
        TaskType.AUTOMATION
      );

      const result = router.route({ userId: 'user-1', intent });
      expect(result.estimatedDuration).toBe(10000);
    });

    it('should estimate AI durations with complexity multipliers', () => {
      const complexIntent = createMockIntent(
        AIIntentType.ANALYZE_DATA,
        IntentClassification.AI_POWERED,
        TaskType.ANALYSIS,
        AIProvider.CLAUDE,
        [],
        'complex'
      );

      const simpleIntent = createMockIntent(
        AIIntentType.CORRECT_GRAMMAR,
        IntentClassification.AI_POWERED,
        TaskType.GENERATION,
        AIProvider.CHATGPT,
        [],
        'simple'
      );

      const complexResult = router.route({ userId: 'user-1', intent: complexIntent });
      const simpleResult = router.route({ userId: 'user-1', intent: simpleIntent });

      expect(complexResult.estimatedDuration).toBeGreaterThan(simpleResult.estimatedDuration);
    });
  });

  describe('Batch Routing', () => {
    it('should route multiple contexts', () => {
      const contexts = [
        {
          userId: 'user-1',
          intent: createMockIntent(AIIntentType.WRITE_POST, IntentClassification.AI_POWERED, TaskType.GENERATION),
        },
        {
          userId: 'user-2',
          intent: createMockIntent(AIIntentType.NAVIGATE_URL, IntentClassification.DETERMINISTIC, TaskType.AUTOMATION),
        },
      ];

      const results = router.routeBatch(contexts);

      expect(results).toHaveLength(2);
      expect(results[0].route).toBe('ai_powered');
      expect(results[1].route).toBe('deterministic');
    });
  });

  describe('Configuration', () => {
    it('should allow config updates', () => {
      router.updateConfig({ defaultPriority: 8 });
      const config = router.getConfig();
      expect(config.defaultPriority).toBe(8);
    });

    it('should respect browser automation disabled config', () => {
      const noBrowserRouter = new AITaskRouter({ browserAutomationEnabled: false });
      const intent = createMockIntent(
        AIIntentType.NAVIGATE_URL,
        IntentClassification.DETERMINISTIC,
        TaskType.AUTOMATION
      );

      const result = noBrowserRouter.route({ userId: 'user-1', intent });
      expect(result.requiresBrowser).toBe(false);
    });

    it('should respect hybrid routing disabled config', () => {
      const noHybridRouter = new AITaskRouter({ enableHybridRouting: false });
      const intent = createMockIntent(
        AIIntentType.EXTRACT_INFO,
        IntentClassification.HYBRID,
        TaskType.ANALYSIS,
        AIProvider.PERPLEXITY,
        [{ type: 'url', value: 'https://example.com' }]
      );

      const result = noHybridRouter.route({ userId: 'user-1', intent });
      expect(result.route).toBe('ai_powered');
    });
  });
});
