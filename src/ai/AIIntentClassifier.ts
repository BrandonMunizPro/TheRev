import {
  AIIntentType,
  AIProvider,
  TaskType,
  IntentClassification,
  IntentClassificationResult,
  IntentClassifierConfig,
  DEFAULT_INTENT_CONFIG,
  INTENT_TASK_TYPE_MAP,
  INTENT_CLASSIFICATION_MAP,
  DEFAULT_PROVIDER_MAP,
  COMPLEXITY_MAP,
  ExtractedEntity,
} from './AIIntentTypes';

interface IntentPattern {
  intent: AIIntentType;
  patterns: RegExp[];
  keywords: string[];
  weight: number;
}

const DEFAULT_INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: AIIntentType.WRITE_POST,
    patterns: [
      /write\s+(a\s+)?(post|article|blog|piece)/i,
      /create\s+(a\s+)?(post|article|content)/i,
      /draft\s+(a\s+)?(post|article)/i,
      /compose\s+(a\s+)?(post|message)/i,
    ],
    keywords: [
      'write post',
      'create post',
      'draft article',
      'compose content',
      'write article',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.REPLY_TO_THREAD,
    patterns: [
      /reply\s+to/i,
      /respond\s+to/i,
      /comment\s+on/i,
      /reply\s+thread/i,
    ],
    keywords: ['reply to', 'respond to', 'comment on', 'reply in thread'],
    weight: 1.0,
  },
  {
    intent: AIIntentType.SUMMARIZE_CONTENT,
    patterns: [
      /summarize/i,
      /summarise/i,
      /give\s+(me\s+)?(a\s+)?summary/i,
      /shorten/i,
      /tl;dr/i,
      /too\s+long/i,
      /quick\s+overview/i,
    ],
    keywords: ['summarize', 'summary', 'shorten', 'tldr', 'overview', 'recap'],
    weight: 1.0,
  },
  {
    intent: AIIntentType.GENERATE_IDEA,
    patterns: [
      /generate\s+(an?\s+)?idea/i,
      /brainstorm/i,
      /come\s+up\s+with/i,
      /suggest\s+(some\s+)?(ideas?|topics?)/i,
      /what\s+should\s+(I\s+)?(write|post|create)/i,
    ],
    keywords: [
      'generate idea',
      'brainstorm',
      'suggest topics',
      'what should I write',
      'come up with',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.ANALYZE_DATA,
    patterns: [
      /analyze/i,
      /analysi[sz]/i,
      /examine/i,
      /look\s+into/i,
      /investigate/i,
      /review\s+(the\s+)?data/i,
    ],
    keywords: ['analyze', 'analysis', 'examine', 'investigate', 'review data'],
    weight: 1.0,
  },
  {
    intent: AIIntentType.NAVIGATE_URL,
    patterns: [
      /go\s+to\s+(https?:\/\/)?/i,
      /navigate\s+to/i,
      /open\s+(the\s+)?(website|url|page)/i,
      /visit\s+(the\s+)?site/i,
      /browse\s+to/i,
      /search\s+(.*?)\s+on\s+(youtube|gmail|reddit|wiki|wikipedia|google)/i,
      /(youtube|gmail|reddit|wiki|wikipedia|google)\s+search\s+(for\s+)?/i,
      /^search\s+(.+?)\s+(on\s+)?youtube/i,
      /^(youtube|gmail|reddit|google)\s+(.+)/i,
      /find\s+(.+?)\s+on\s+(youtube|google|reddit)/i,
      /look\s+up\s+(.+?)\s+on\s+(youtube|google)/i,
      /search\s+youtube\s+(for\s+)?/i,
      /search\s+google\s+(for\s+)?/i,
      /search\s+reddit\s+(for\s+)?/i,
      /youtube\s+(.+)/i,
    ],
    keywords: [
      'go to',
      'navigate to',
      'open website',
      'visit',
      'browse to',
      'search youtube',
      'search on youtube',
      'search reddit',
      'search gmail',
      'search google',
      'youtube search',
      'find on youtube',
      'look up on youtube',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.EXTRACT_INFO,
    patterns: [
      /extract/i,
      /pull\s+(out|up)/i,
      /get\s+(the\s+)?(info|data|details)/i,
      /find\s+(the\s+)?(info|data|details)/i,
      /scrape/i,
    ],
    keywords: ['extract', 'pull out', 'get info', 'get data', 'scrape'],
    weight: 1.0,
  },
  {
    intent: AIIntentType.COMPARE_ITEMS,
    patterns: [
      /compare/i,
      /versus/i,
      /vs\.?\s+/i,
      /difference\s+between/i,
      /pros?\s+(and\s+)?cons?/i,
      /which\s+(is\s+)?better/i,
    ],
    keywords: [
      'compare',
      'versus',
      'vs',
      'difference between',
      'pros and cons',
      'which better',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.TRANSLATE_TEXT,
    patterns: [
      /translate/i,
      /convert\s+(to\s+)?(english|spanish|french|german|chinese|japanese|korean)/i,
      /in\s+(english|spanish|french|german|chinese|japanese|korean)/i,
    ],
    keywords: [
      'translate',
      'translation',
      'in spanish',
      'in french',
      'to english',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.CORRECT_GRAMMAR,
    patterns: [
      /correct\s+(grammar|spelling)/i,
      /fix\s+(grammar|spelling|typos)/i,
      /grammar\s+(check|correct)/i,
      /proofread/i,
      /edit\s+(for\s+)?(grammar|spelling)/i,
    ],
    keywords: [
      'correct grammar',
      'fix grammar',
      'grammar check',
      'proofread',
      'fix spelling',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.EXPAND_CONTENT,
    patterns: [
      /expand\s+(on)?/i,
      /elaborate/i,
      /add\s+more\s+(detail|content)/i,
      /go\s+into\s+(more\s+)?detail/i,
      /flesh\s+out/i,
    ],
    keywords: ['expand', 'elaborate', 'add more', 'more detail', 'flesh out'],
    weight: 1.0,
  },
  {
    intent: AIIntentType.SIMPLIFY_CONTENT,
    patterns: [
      /simplify/i,
      /make\s+(it\s+)?simpler/i,
      /easier\s+to\s+understand/i,
      /explain\s+(like\s+)?(I\'m\s+)?(5|five|younger)/i,
      /break\s+down/i,
      /simplify/i,
    ],
    keywords: [
      'simplify',
      'simpler',
      'easier to understand',
      'explain like im 5',
      'break down',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.GENERATE_OUTLINE,
    patterns: [
      /create\s+(an?\s+)?outline/i,
      /generate\s+(an?\s+)?outline/i,
      /give\s+(me\s+)?(an?\s+)?outline/i,
      /outline\s+(for|of)/i,
      /structure/i,
    ],
    keywords: [
      'create outline',
      'generate outline',
      'outline for',
      'structure',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.SEO_OPTIMIZE,
    patterns: [
      /seo\s+optimize/i,
      /search\s+engine\s+optim/i,
      /rank\s+(higher|better)/i,
      /keywords?\s+(for|optim)/i,
      /meta\s+(description|title)/i,
    ],
    keywords: [
      'seo',
      'search engine',
      'rank higher',
      'keywords',
      'meta description',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.CREATE_SOCIAL_POST,
    patterns: [
      /create\s+(a\s+)?(twitter|facebook|linkedin|instagram|tiktok)\s+post/i,
      /write\s+(a\s+)?tweet/i,
      /draft\s+(a\s+)?(tweet|post)/i,
      /social\s+media/i,
    ],
    keywords: [
      'twitter post',
      'facebook post',
      'tweet',
      'social media',
      'linkedin',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.DETERMINISTIC_AUTOMATION,
    patterns: [
      /automate/i,
      /auto\s+fill/i,
      /click\s+(the\s+)?/i,
      /click\s+on\s+(the\s+)?/i,
      /click\s+(on\s+)?this/i,
      /type\s+(into)?/i,
      /scroll/i,
      /wait\s+(for)?/i,
      /play\s+(the\s+)?(video)?/i,
      /watch\s+(the\s+)?(video)?/i,
      /open\s+(the\s+)?video/i,
      /start\s+(the\s+)?video/i,
      /pause\s+(the\s+)?video/i,
      /select\s+(the\s+)?/i,
      /navigate\s+to/i,
    ],
    keywords: [
      'automate',
      'auto fill',
      'click',
      'click on',
      'click this',
      'type into',
      'scroll',
      'automation',
      'play',
      'watch',
      'open video',
      'start video',
      'select',
    ],
    weight: 0.9,
  },
  {
    intent: AIIntentType.FORM_FILLING,
    patterns: [
      /fill\s+(out\s+)?(the\s+)?form/i,
      /submit\s+(the\s+)?form/i,
      /enter\s+(data\s+)?into/i,
      /complete\s+(the\s+)?form/i,
    ],
    keywords: ['fill form', 'submit form', 'enter data', 'complete form'],
    weight: 1.0,
  },
  {
    intent: AIIntentType.DATA_ENTRY,
    patterns: [
      /enter\s+data/i,
      /input\s+data/i,
      /add\s+data/i,
      /populate\s+(the\s+)?(spreadsheet|database)/i,
      /copy\s+(data|info)/i,
    ],
    keywords: ['enter data', 'input data', 'add data', 'populate', 'copy data'],
    weight: 1.0,
  },
  {
    intent: AIIntentType.SCREEN_SCRAPE,
    patterns: [
      /scrape/i,
      /crawl/i,
      /extract\s+from\s+(web|page)/i,
      /get\s+(content\s+)?from/i,
      /download\s+(from)?/i,
    ],
    keywords: [
      'scrape',
      'crawl',
      'extract from web',
      'get from page',
      'download',
    ],
    weight: 1.0,
  },
  {
    intent: AIIntentType.API_INTEGRATION,
    patterns: [
      /connect\s+to\s+api/i,
      /call\s+api/i,
      /fetch\s+from\s+api/i,
      /integrate\s+(with)?/i,
      /webhook/i,
    ],
    keywords: [
      'connect to api',
      'call api',
      'fetch from api',
      'integrate',
      'webhook',
    ],
    weight: 1.0,
  },
];

const ENTITY_PATTERNS = {
  url: /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  number: /\b\d+(\.\d+)?\b/g,
  date: /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/g,
};

export class AIIntentClassifier {
  private config: IntentClassifierConfig;
  private intentPatterns: IntentPattern[];

  constructor(config: Partial<IntentClassifierConfig> = {}) {
    this.config = { ...DEFAULT_INTENT_CONFIG, ...config };
    this.intentPatterns = DEFAULT_INTENT_PATTERNS;
  }

  addCustomPatterns(patterns: IntentPattern[]): void {
    this.intentPatterns.push(...patterns);
  }

  classify(input: string): IntentClassificationResult {
    const normalizedInput = input.trim().toLowerCase();

    const scoredIntents = this.calculateIntentScores(normalizedInput);

    if (scoredIntents.length === 0) {
      return this.createUnknownResult(input);
    }

    const bestMatch = scoredIntents[0];

    if (bestMatch.score < this.config.confidenceThreshold) {
      return this.createUnknownResult(input);
    }

    const entities = this.config.enableEntityExtraction
      ? this.extractEntities(input)
      : [];

    const intent = bestMatch.intent;
    const taskType = INTENT_TASK_TYPE_MAP[intent];
    const classification = INTENT_CLASSIFICATION_MAP[intent];
    const recommendedProvider = this.selectProvider(intent, classification);
    const complexity = COMPLEXITY_MAP[intent];

    const fallbackIntents = scoredIntents
      .filter((s) => s.intent !== intent && s.score > 0.3)
      .slice(0, 3)
      .map((s) => s.intent);

    return {
      intent,
      confidence: bestMatch.score,
      classification,
      taskType,
      recommendedProvider,
      parameters: this.extractParameters(intent, input),
      entities,
      requiresReasoning: classification === IntentClassification.AI_POWERED,
      requiresWebAccess: [
        AIIntentType.NAVIGATE_URL,
        AIIntentType.EXTRACT_INFO,
        AIIntentType.SCREEN_SCRAPE,
      ].includes(intent),
      estimatedComplexity: complexity,
      fallbackIntents,
      rawInput: input,
      processingHints: this.generateProcessingHints(intent, classification),
    };
  }

  private calculateIntentScores(
    input: string
  ): Array<{ intent: AIIntentType; score: number }> {
    const scores = new Map<AIIntentType, number>();

    for (const pattern of this.intentPatterns) {
      let matchScore = 0;

      for (const regex of pattern.patterns) {
        if (regex.test(input)) {
          matchScore = Math.max(matchScore, pattern.weight);
        }
      }

      if (matchScore === 0) {
        for (const keyword of pattern.keywords) {
          if (input.includes(keyword.toLowerCase())) {
            matchScore = Math.max(matchScore, pattern.weight * 0.7);
            break;
          }
        }
      }

      if (matchScore > 0) {
        const currentScore = scores.get(pattern.intent) || 0;
        scores.set(pattern.intent, Math.max(currentScore, matchScore));
      }
    }

    const sortedScores = Array.from(scores.entries())
      .map(([intent, score]) => ({ intent, score }))
      .sort((a, b) => b.score - a.score);

    return sortedScores;
  }

  private extractEntities(input: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    const urls = input.match(ENTITY_PATTERNS.url);
    if (urls) {
      for (const url of urls) {
        entities.push({
          type: 'url',
          value: url,
          confidence: 0.95,
        });
      }
    }

    const emails = input.match(ENTITY_PATTERNS.email);
    if (emails) {
      for (const email of emails) {
        entities.push({
          type: 'email',
          value: email,
          confidence: 0.95,
        });
      }
    }

    const topicMatch = input.match(
      /(?:about|on|regarding|subject[:\s]+)([^,.\n]+)/i
    );
    if (topicMatch) {
      entities.push({
        type: 'topic',
        value: topicMatch[1].trim(),
        confidence: 0.7,
      });
    }

    return entities;
  }

  private extractParameters(
    intent: AIIntentType,
    input: string
  ): {
    name: string;
    value: string | number | boolean | object;
    required: boolean;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  }[] {
    const parameters: {
      name: string;
      value: string | number | boolean | object;
      required: boolean;
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    }[] = [];

    switch (intent) {
      case AIIntentType.WRITE_POST:
      case AIIntentType.CREATE_SOCIAL_POST:
        const topicMatch = input.match(
          /(?:about|on|regarding|subject[:\s]+)([^,.\n]+)/i
        );
        if (topicMatch) {
          parameters.push({
            name: 'topic',
            value: topicMatch[1].trim(),
            required: false,
            type: 'string',
          });
        }
        const toneMatch = input.match(/(?:tone|style)[:\s]+(\w+)/i);
        if (toneMatch) {
          parameters.push({
            name: 'tone',
            value: toneMatch[1].trim(),
            required: false,
            type: 'string',
          });
        }
        break;

      case AIIntentType.SUMMARIZE_CONTENT:
        const lengthMatch = input.match(/(?:length|size)[:\s]+(\w+)/i);
        if (lengthMatch) {
          parameters.push({
            name: 'length',
            value: lengthMatch[1].trim(),
            required: false,
            type: 'string',
          });
        }
        break;

      case AIIntentType.NAVIGATE_URL:
        const urlMatch = input.match(/(?:https?:\/\/|www\.)[^\s]+/i);
        if (urlMatch) {
          parameters.push({
            name: 'url',
            value: urlMatch[0],
            required: true,
            type: 'string',
          });
        }
        break;

      case AIIntentType.TRANSLATE_TEXT:
        const langMatch = input.match(
          /(?:to|in)\s+(english|spanish|french|german|chinese|japanese|korean|portuguese|italian|russian)/i
        );
        if (langMatch) {
          parameters.push({
            name: 'targetLanguage',
            value: langMatch[1].toLowerCase(),
            required: true,
            type: 'string',
          });
        }
        break;

      case AIIntentType.ANALYZE_DATA:
        parameters.push({
          name: 'includeCharts',
          value: input.includes('chart') || input.includes('visual'),
          required: false,
          type: 'boolean',
        });
        break;
    }

    return parameters;
  }

  private selectProvider(
    intent: AIIntentType,
    classification: IntentClassification
  ): AIProvider {
    if (classification === IntentClassification.DETERMINISTIC) {
      return AIProvider.DETERMINISTIC;
    }

    return DEFAULT_PROVIDER_MAP[intent];
  }

  private generateProcessingHints(
    intent: AIIntentType,
    classification: IntentClassification
  ):
    | { maxTokens?: number; temperature?: number; systemPrompt?: string }
    | undefined {
    if (classification === IntentClassification.DETERMINISTIC) {
      return undefined;
    }

    const hints: Partial<
      Record<
        AIIntentType,
        { maxTokens?: number; temperature?: number; systemPrompt?: string }
      >
    > = {
      [AIIntentType.WRITE_POST]: {
        maxTokens: 2000,
        temperature: 0.7,
        systemPrompt:
          'You are a professional content writer. Write engaging, well-structured posts.',
      },
      [AIIntentType.SUMMARIZE_CONTENT]: {
        maxTokens: 500,
        temperature: 0.3,
        systemPrompt:
          'You are a summarization expert. Provide concise, accurate summaries.',
      },
      [AIIntentType.GENERATE_IDEA]: {
        maxTokens: 1000,
        temperature: 0.9,
        systemPrompt:
          'You are a creative brainstorming assistant. Generate innovative ideas.',
      },
      [AIIntentType.ANALYZE_DATA]: {
        maxTokens: 2000,
        temperature: 0.2,
        systemPrompt:
          'You are a data analyst. Provide accurate, detailed analysis with insights.',
      },
      [AIIntentType.CORRECT_GRAMMAR]: {
        maxTokens: 2000,
        temperature: 0.1,
        systemPrompt:
          'You are a grammar expert. Correct grammar and spelling errors while preserving meaning.',
      },
    };

    return hints[intent] || { maxTokens: 1000, temperature: 0.7 };
  }

  private createUnknownResult(input: string): IntentClassificationResult {
    return {
      intent: AIIntentType.UNKNOWN,
      confidence: 0,
      classification: IntentClassification.AI_POWERED,
      taskType: TaskType.GENERATION,
      recommendedProvider: AIProvider.CHATGPT,
      parameters: [],
      entities: [],
      requiresReasoning: true,
      requiresWebAccess: false,
      estimatedComplexity: 'moderate',
      fallbackIntents: [],
      rawInput: input,
    };
  }

  classifyBatch(inputs: string[]): IntentClassificationResult[] {
    return inputs.map((input) => this.classify(input));
  }
}

export function createIntentClassifier(
  config?: Partial<IntentClassifierConfig>
): AIIntentClassifier {
  return new AIIntentClassifier(config);
}
