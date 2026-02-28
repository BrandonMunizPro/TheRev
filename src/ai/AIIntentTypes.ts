export enum AIIntentType {
  WRITE_POST = 'write_post',
  REPLY_TO_THREAD = 'reply_to_thread',
  SUMMARIZE_CONTENT = 'summarize_content',
  GENERATE_IDEA = 'generate_idea',
  ANALYZE_DATA = 'analyze_data',
  NAVIGATE_URL = 'navigate_url',
  EXTRACT_INFO = 'extract_info',
  COMPARE_ITEMS = 'compare_items',
  TRANSLATE_TEXT = 'translate_text',
  CORRECT_GRAMMAR = 'correct_grammar',
  EXPAND_CONTENT = 'expand_content',
  SIMPLIFY_CONTENT = 'simplify_content',
  GENERATE_OUTLINE = 'generate_outline',
  SEO_OPTIMIZE = 'seo_optimize',
  CREATE_SOCIAL_POST = 'create_social_post',
  DETERMINISTIC_AUTOMATION = 'deterministic_automation',
  FORM_FILLING = 'form_filling',
  DATA_ENTRY = 'data_entry',
  SCREEN_SCRAPE = 'screen_scrape',
  API_INTEGRATION = 'api_integration',
  UNKNOWN = 'unknown',
}

export enum AIProvider {
  CHATGPT = 'chatgpt',
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  PERPLEXITY = 'perplexity',
  DETERMINISTIC = 'deterministic',
  OPEN_SOURCE = 'open_source',
}

export enum TaskType {
  AUTOMATION = 'automation',
  GENERATION = 'generation',
  ANALYSIS = 'analysis',
}

export enum IntentClassification {
  DETERMINISTIC = 'deterministic',
  AI_POWERED = 'ai_powered',
  HYBRID = 'hybrid',
}

export interface IntentParameter {
  name: string;
  value: string | number | boolean | object;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

export interface ExtractedEntity {
  type: 'url' | 'email' | 'number' | 'date' | 'topic' | 'person' | 'location' | 'custom';
  value: string;
  confidence: number;
  startIndex?: number;
  endIndex?: number;
}

export interface IntentClassificationResult {
  intent: AIIntentType;
  confidence: number;
  classification: IntentClassification;
  taskType: TaskType;
  recommendedProvider: AIProvider;
  parameters: IntentParameter[];
  entities: ExtractedEntity[];
  requiresReasoning: boolean;
  requiresWebAccess: boolean;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  fallbackIntents: AIIntentType[];
  rawInput: string;
  processingHints?: {
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  };
}

export interface IntentClassifierConfig {
  confidenceThreshold: number;
  enableEntityExtraction: boolean;
  enableHybridDetection: boolean;
  customIntentPatterns?: Map<string, RegExp[]>;
  providerCapabilities?: Map<AIProvider, string[]>;
}

export const DEFAULT_INTENT_CONFIG: IntentClassifierConfig = {
  confidenceThreshold: 0.7,
  enableEntityExtraction: true,
  enableHybridDetection: true,
  providerCapabilities: new Map([
    [AIProvider.CHATGPT, ['generation', 'analysis', 'reasoning']],
    [AIProvider.CLAUDE, ['generation', 'analysis', 'reasoning', 'long_context']],
    [AIProvider.GEMINI, ['generation', 'analysis', 'multimodal']],
    [AIProvider.PERPLEXITY, ['search', 'research', 'fact_checking']],
    [AIProvider.DETERMINISTIC, ['automation', 'form_filling', 'data_entry', 'scraping']],
    [AIProvider.OPEN_SOURCE, ['generation', 'analysis', 'reasoning', 'free']],
  ]),
};

export const INTENT_TASK_TYPE_MAP: Record<AIIntentType, TaskType> = {
  [AIIntentType.WRITE_POST]: TaskType.GENERATION,
  [AIIntentType.REPLY_TO_THREAD]: TaskType.GENERATION,
  [AIIntentType.SUMMARIZE_CONTENT]: TaskType.ANALYSIS,
  [AIIntentType.GENERATE_IDEA]: TaskType.GENERATION,
  [AIIntentType.ANALYZE_DATA]: TaskType.ANALYSIS,
  [AIIntentType.NAVIGATE_URL]: TaskType.AUTOMATION,
  [AIIntentType.EXTRACT_INFO]: TaskType.ANALYSIS,
  [AIIntentType.COMPARE_ITEMS]: TaskType.ANALYSIS,
  [AIIntentType.TRANSLATE_TEXT]: TaskType.GENERATION,
  [AIIntentType.CORRECT_GRAMMAR]: TaskType.GENERATION,
  [AIIntentType.EXPAND_CONTENT]: TaskType.GENERATION,
  [AIIntentType.SIMPLIFY_CONTENT]: TaskType.GENERATION,
  [AIIntentType.GENERATE_OUTLINE]: TaskType.GENERATION,
  [AIIntentType.SEO_OPTIMIZE]: TaskType.GENERATION,
  [AIIntentType.CREATE_SOCIAL_POST]: TaskType.GENERATION,
  [AIIntentType.DETERMINISTIC_AUTOMATION]: TaskType.AUTOMATION,
  [AIIntentType.FORM_FILLING]: TaskType.AUTOMATION,
  [AIIntentType.DATA_ENTRY]: TaskType.AUTOMATION,
  [AIIntentType.SCREEN_SCRAPE]: TaskType.AUTOMATION,
  [AIIntentType.API_INTEGRATION]: TaskType.AUTOMATION,
  [AIIntentType.UNKNOWN]: TaskType.GENERATION,
};

export const INTENT_CLASSIFICATION_MAP: Record<AIIntentType, IntentClassification> = {
  [AIIntentType.WRITE_POST]: IntentClassification.AI_POWERED,
  [AIIntentType.REPLY_TO_THREAD]: IntentClassification.AI_POWERED,
  [AIIntentType.SUMMARIZE_CONTENT]: IntentClassification.AI_POWERED,
  [AIIntentType.GENERATE_IDEA]: IntentClassification.AI_POWERED,
  [AIIntentType.ANALYZE_DATA]: IntentClassification.AI_POWERED,
  [AIIntentType.NAVIGATE_URL]: IntentClassification.DETERMINISTIC,
  [AIIntentType.EXTRACT_INFO]: IntentClassification.HYBRID,
  [AIIntentType.COMPARE_ITEMS]: IntentClassification.AI_POWERED,
  [AIIntentType.TRANSLATE_TEXT]: IntentClassification.HYBRID,
  [AIIntentType.CORRECT_GRAMMAR]: IntentClassification.AI_POWERED,
  [AIIntentType.EXPAND_CONTENT]: IntentClassification.AI_POWERED,
  [AIIntentType.SIMPLIFY_CONTENT]: IntentClassification.AI_POWERED,
  [AIIntentType.GENERATE_OUTLINE]: IntentClassification.AI_POWERED,
  [AIIntentType.SEO_OPTIMIZE]: IntentClassification.AI_POWERED,
  [AIIntentType.CREATE_SOCIAL_POST]: IntentClassification.AI_POWERED,
  [AIIntentType.DETERMINISTIC_AUTOMATION]: IntentClassification.DETERMINISTIC,
  [AIIntentType.FORM_FILLING]: IntentClassification.DETERMINISTIC,
  [AIIntentType.DATA_ENTRY]: IntentClassification.DETERMINISTIC,
  [AIIntentType.SCREEN_SCRAPE]: IntentClassification.DETERMINISTIC,
  [AIIntentType.API_INTEGRATION]: IntentClassification.DETERMINISTIC,
  [AIIntentType.UNKNOWN]: IntentClassification.AI_POWERED,
};

export const DEFAULT_PROVIDER_MAP: Record<AIIntentType, AIProvider> = {
  [AIIntentType.WRITE_POST]: AIProvider.CHATGPT,
  [AIIntentType.REPLY_TO_THREAD]: AIProvider.CHATGPT,
  [AIIntentType.SUMMARIZE_CONTENT]: AIProvider.CLAUDE,
  [AIIntentType.GENERATE_IDEA]: AIProvider.CHATGPT,
  [AIIntentType.ANALYZE_DATA]: AIProvider.CLAUDE,
  [AIIntentType.NAVIGATE_URL]: AIProvider.DETERMINISTIC,
  [AIIntentType.EXTRACT_INFO]: AIProvider.PERPLEXITY,
  [AIIntentType.COMPARE_ITEMS]: AIProvider.CHATGPT,
  [AIIntentType.TRANSLATE_TEXT]: AIProvider.CHATGPT,
  [AIIntentType.CORRECT_GRAMMAR]: AIProvider.CHATGPT,
  [AIIntentType.EXPAND_CONTENT]: AIProvider.CHATGPT,
  [AIIntentType.SIMPLIFY_CONTENT]: AIProvider.CHATGPT,
  [AIIntentType.GENERATE_OUTLINE]: AIProvider.CHATGPT,
  [AIIntentType.SEO_OPTIMIZE]: AIProvider.CHATGPT,
  [AIIntentType.CREATE_SOCIAL_POST]: AIProvider.CHATGPT,
  [AIIntentType.DETERMINISTIC_AUTOMATION]: AIProvider.DETERMINISTIC,
  [AIIntentType.FORM_FILLING]: AIProvider.DETERMINISTIC,
  [AIIntentType.DATA_ENTRY]: AIProvider.DETERMINISTIC,
  [AIIntentType.SCREEN_SCRAPE]: AIProvider.DETERMINISTIC,
  [AIIntentType.API_INTEGRATION]: AIProvider.DETERMINISTIC,
  [AIIntentType.UNKNOWN]: AIProvider.CHATGPT,
};

export const COMPLEXITY_MAP: Record<AIIntentType, 'simple' | 'moderate' | 'complex'> = {
  [AIIntentType.WRITE_POST]: 'moderate',
  [AIIntentType.REPLY_TO_THREAD]: 'simple',
  [AIIntentType.SUMMARIZE_CONTENT]: 'simple',
  [AIIntentType.GENERATE_IDEA]: 'moderate',
  [AIIntentType.ANALYZE_DATA]: 'complex',
  [AIIntentType.NAVIGATE_URL]: 'simple',
  [AIIntentType.EXTRACT_INFO]: 'moderate',
  [AIIntentType.COMPARE_ITEMS]: 'moderate',
  [AIIntentType.TRANSLATE_TEXT]: 'simple',
  [AIIntentType.CORRECT_GRAMMAR]: 'simple',
  [AIIntentType.EXPAND_CONTENT]: 'moderate',
  [AIIntentType.SIMPLIFY_CONTENT]: 'simple',
  [AIIntentType.GENERATE_OUTLINE]: 'moderate',
  [AIIntentType.SEO_OPTIMIZE]: 'moderate',
  [AIIntentType.CREATE_SOCIAL_POST]: 'simple',
  [AIIntentType.DETERMINISTIC_AUTOMATION]: 'moderate',
  [AIIntentType.FORM_FILLING]: 'simple',
  [AIIntentType.DATA_ENTRY]: 'simple',
  [AIIntentType.SCREEN_SCRAPE]: 'moderate',
  [AIIntentType.API_INTEGRATION]: 'complex',
  [AIIntentType.UNKNOWN]: 'moderate',
};
