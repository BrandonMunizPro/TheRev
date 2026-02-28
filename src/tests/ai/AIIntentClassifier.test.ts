import { AIIntentClassifier } from '../../ai/AIIntentClassifier';
import {
  AIIntentType,
  AIProvider,
  IntentClassification,
  TaskType,
} from '../../ai/AIIntentTypes';

describe('AIIntentClassifier', () => {
  let classifier: AIIntentClassifier;

  beforeEach(() => {
    classifier = new AIIntentClassifier();
  });

  describe('Content Generation Intents', () => {
    it('should classify WRITE_POST intent', () => {
      const result = classifier.classify('Write a post about artificial intelligence');
      expect(result.intent).toBe(AIIntentType.WRITE_POST);
      expect(result.classification).toBe(IntentClassification.AI_POWERED);
      expect(result.taskType).toBe(TaskType.GENERATION);
      expect(result.recommendedProvider).toBe(AIProvider.CHATGPT);
    });

    it('should classify REPLY_TO_THREAD intent', () => {
      const result = classifier.classify('Reply to this thread');
      expect(result.intent).toBe(AIIntentType.REPLY_TO_THREAD);
      expect(result.taskType).toBe(TaskType.GENERATION);
    });

    it('should classify SUMMARIZE_CONTENT intent', () => {
      const result = classifier.classify('Summarize this article');
      expect(result.intent).toBe(AIIntentType.SUMMARIZE_CONTENT);
      expect(result.recommendedProvider).toBe(AIProvider.CLAUDE);
    });

    it('should classify GENERATE_IDEA intent', () => {
      const result = classifier.classify('Generate an idea for a blog post');
      expect(result.intent).toBe(AIIntentType.GENERATE_IDEA);
    });

    it('should classify ANALYZE_DATA intent', () => {
      const result = classifier.classify('Analyze the data from last quarter');
      expect(result.intent).toBe(AIIntentType.ANALYZE_DATA);
      expect(result.estimatedComplexity).toBe('complex');
      expect(result.recommendedProvider).toBe(AIProvider.CLAUDE);
    });

    it('should classify TRANSLATE_TEXT intent', () => {
      const result = classifier.classify('Translate this to Spanish');
      expect(result.intent).toBe(AIIntentType.TRANSLATE_TEXT);
    });

    it('should classify CORRECT_GRAMMAR intent', () => {
      const result = classifier.classify('Correct grammar in this text');
      expect(result.intent).toBe(AIIntentType.CORRECT_GRAMMAR);
    });

    it('should classify EXPAND_CONTENT intent', () => {
      const result = classifier.classify('Expand on this paragraph');
      expect(result.intent).toBe(AIIntentType.EXPAND_CONTENT);
    });

    it('should classify SIMPLIFY_CONTENT intent', () => {
      const result = classifier.classify('Simplify this for me');
      expect(result.intent).toBe(AIIntentType.SIMPLIFY_CONTENT);
    });

    it('should classify CREATE_SOCIAL_POST intent', () => {
      const result = classifier.classify('Create a twitter post about our new product');
      expect(result.intent).toBe(AIIntentType.CREATE_SOCIAL_POST);
    });
  });

  describe('Deterministic Automation Intents', () => {
    it('should classify NAVIGATE_URL as deterministic', () => {
      const result = classifier.classify('Go to https://example.com');
      expect(result.intent).toBe(AIIntentType.NAVIGATE_URL);
      expect(result.classification).toBe(IntentClassification.DETERMINISTIC);
      expect(result.requiresWebAccess).toBe(true);
    });

    it('should classify FORM_FILLING as deterministic', () => {
      const result = classifier.classify('Fill out form');
      expect(result.intent).toBe(AIIntentType.FORM_FILLING);
      expect(result.classification).toBe(IntentClassification.DETERMINISTIC);
    });

    it('should classify DATA_ENTRY as deterministic', () => {
      const result = classifier.classify('Input data into database');
      expect(result.intent).toBe(AIIntentType.DATA_ENTRY);
      expect(result.classification).toBe(IntentClassification.DETERMINISTIC);
    });

    it('should classify SCREEN_SCRAPE as deterministic', () => {
      const result = classifier.classify('Crawl the website for data');
      expect([AIIntentType.SCREEN_SCRAPE, AIIntentType.EXTRACT_INFO]).toContain(result.intent);
      expect(result.requiresWebAccess).toBe(true);
    });
  });

  describe('Hybrid Intents', () => {
    it('should classify EXTRACT_INFO as hybrid', () => {
      const result = classifier.classify('Extract information from https://example.com');
      expect(result.intent).toBe(AIIntentType.EXTRACT_INFO);
      expect(result.classification).toBe(IntentClassification.HYBRID);
      expect(result.requiresWebAccess).toBe(true);
    });
  });

  describe('Entity Extraction', () => {
    it('should extract URL entities', () => {
      const result = classifier.classify('Summarize https://example.com/article');
      const hasUrlEntity = result.entities.some(e => e.type === 'url');
      expect(hasUrlEntity).toBe(true);
    });

    it('should extract topic entities', () => {
      const result = classifier.classify('Write a post about machine learning');
      const topicEntity = result.entities.find(e => e.type === 'topic');
      expect(topicEntity).toBeDefined();
    });
  });

  describe('Parameter Extraction', () => {
    it('should extract topic parameter for WRITE_POST', () => {
      const result = classifier.classify('Write a post about climate change');
      const topicParam = result.parameters.find(p => p.name === 'topic');
      expect(topicParam).toBeDefined();
      expect(topicParam?.value).toBe('climate change');
    });

    it('should extract target language for TRANSLATE_TEXT', () => {
      const result = classifier.classify('Translate this to Japanese');
      const langParam = result.parameters.find(p => p.name === 'targetLanguage');
      expect(langParam).toBeDefined();
      expect(langParam?.value).toBe('japanese');
    });

    it('should extract URL parameter for NAVIGATE_URL', () => {
      const result = classifier.classify('Navigate to https://google.com');
      const urlParam = result.parameters.find(p => p.name === 'url');
      expect(urlParam).toBeDefined();
      expect(urlParam?.required).toBe(true);
    });
  });

  describe('Unknown Intent Handling', () => {
    it('should return UNKNOWN for unrecognized input below threshold', () => {
      const result = classifier.classify('xyz123 random text');
      expect(result.intent).toBe(AIIntentType.UNKNOWN);
      expect(result.confidence).toBe(0);
    });
  });

  describe('Batch Classification', () => {
    it('should classify multiple inputs', () => {
      const inputs = [
        'Write a post about AI',
        'Go to https://example.com',
        'Summarize this article',
      ];
      const results = classifier.classifyBatch(inputs);
      
      expect(results).toHaveLength(3);
      expect(results[0].intent).toBe(AIIntentType.WRITE_POST);
      expect(results[1].intent).toBe(AIIntentType.NAVIGATE_URL);
      expect(results[2].intent).toBe(AIIntentType.SUMMARIZE_CONTENT);
    });
  });

  describe('Confidence Thresholds', () => {
    it('should respect custom confidence threshold', () => {
      const strictClassifier = new AIIntentClassifier({ confidenceThreshold: 0.9 });
      const result = strictClassifier.classify('Write something');
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });
  });
});
