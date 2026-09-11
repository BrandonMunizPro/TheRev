import { TechnicalQuestionClassifier } from '../../ai/technical-copilot/TechnicalQuestionClassifier';
import { TechnicalDomain } from '../../ai/technical-copilot/types';

describe('TechnicalQuestionClassifier', () => {
  let classifier: TechnicalQuestionClassifier;

  beforeEach(() => {
    classifier = new TechnicalQuestionClassifier();
  });

  describe('Question Detection', () => {
    it('should detect a duplicate-processing question in distributed systems', () => {
      const result = classifier.classify(
        'How would you prevent duplicate processing if this consumer retries?'
      );

      expect(result).not.toBeNull();
      expect(result!.domain).toBe(TechnicalDomain.DISTRIBUTED_SYSTEMS);
      expect(result!.confidence).toBeGreaterThan(0.4);
    });

    it('should detect an external provider unavailability question', () => {
      const result = classifier.classify(
        'How would you handle an external provider being unavailable?'
      );

      expect(result).not.toBeNull();
      expect(result!.domain).toBe(
        TechnicalDomain.RELIABILITY_FAULT_TOLERANCE
      );
      expect(result!.confidence).toBeGreaterThan(0.4);
    });

    it('should detect a slow database read question in caching domain', () => {
      const result = classifier.classify(
        'The database read is slow and happens repeatedly, what should we do?'
      );

      expect(result).not.toBeNull();
      expect([
        TechnicalDomain.CACHING,
        TechnicalDomain.DATABASES_SQL,
      ]).toContain(result!.domain);
    });

    it('should detect API design questions', () => {
      const result = classifier.classify(
        'How should we design the API so it handles rate limiting?'
      );

      expect(result).not.toBeNull();
      expect(result!.domain).toBe(TechnicalDomain.API_DESIGN);
    });

    it('should return null for empty or very short input', () => {
      expect(classifier.classify('')).toBeNull();
      expect(classifier.classify('ok')).toBeNull();
      expect(classifier.classify('thanks')).toBeNull();
    });

    it('should return null for irrelevant non-technical transcript', () => {
      const result = classifier.classify(
        'Can you pass the salt? The weather is really nice today.'
      );

      expect(result).toBeNull();
    });
  });

  describe('Rolling Context Classification', () => {
    it('should classify from multiple fragments', () => {
      const fragments = [
        {
          text: 'We are seeing some issues with our message consumers.',
          timestamp: Date.now(),
        },
        {
          text: 'How would we handle the case where it retries?',
          timestamp: Date.now(),
        },
      ];

      const result = classifier.classifyFromFragments(fragments);
      expect(result).not.toBeNull();
      expect(result!.domain).toBe(TechnicalDomain.DISTRIBUTED_SYSTEMS);
    });

    it('should return null when fragments are all irrelevant', () => {
      const fragments = [
        { text: 'I ordered pizza', timestamp: Date.now() },
        { text: 'Can we reschedule the meeting', timestamp: Date.now() },
      ];

      const result = classifier.classifyFromFragments(fragments);
      expect(result).toBeNull();
    });
  });
});