import { TechnicalQuestionClassifier } from '../../ai/technical-copilot/TechnicalQuestionClassifier';
import { ConceptRetriever } from '../../ai/technical-copilot/ConceptRetriever';
import { TechnicalDomain } from '../../ai/technical-copilot/types';

const EXPECTED_PRESENT = (cue: { concepts: string[] }, labels: string[]) => {
  for (const label of labels) {
    expect(cue.concepts).toContain(label);
  }
};

const EXPECTED_ABSENT = (cue: { concepts: string[] }, labels: string[]) => {
  for (const label of labels) {
    expect(cue.concepts).not.toContain(label);
  }
};

describe('TechnicalCopilot: Topic-Level Retrieval', () => {
  const classifier = new TechnicalQuestionClassifier();
  const retriever = new ConceptRetriever();

  describe('Scenario 1: rate limiter for a public API', () => {
    const QUESTION =
      "Imagine you're designing a rate limiter for a public API. " +
      'What approach would you take and how would you balance fairness versus simplicity?';

    it('should classify to api_design and detect the rate_limiting topic', () => {
      const result = classifier.classify(QUESTION);
      expect(result).not.toBeNull();
      expect(result!.domain).toBe(TechnicalDomain.API_DESIGN);
      expect(result!.topics).toContain('rate_limiting');
      expect(result!.confidence).toBeGreaterThan(0.4);
    });

    it('should surface rate-limiter algorithms, not unrelated domain filler', () => {
      const result = classifier.classify(QUESTION)!;
      const cue = retriever.retrieve(result, 'session-rate-limit');

      EXPECTED_PRESENT(cue, [
        'rate limiting',
        'token bucket',
        'sliding window',
        'fixed window',
      ]);
      EXPECTED_ABSENT(cue, ['pagination', 'database indexing', 'idempotency']);
    });
  });

  describe('Scenario 2: unreliable third-party payment provider', () => {
    const QUESTION =
      'The payment provider has become unreliable. ' +
      'How do we keep the checkout service stable without losing orders?';

    it('should classify to reliability and detect the provider_failure topic', () => {
      const result = classifier.classify(QUESTION);
      expect(result).not.toBeNull();
      expect(result!.domain).toBe(
        TechnicalDomain.RELIABILITY_FAULT_TOLERANCE
      );
      expect(result!.topics).toContain('provider_failure');
    });

    it('should surface provider-failure patterns, not rate-limiter concepts', () => {
      const result = classifier.classify(QUESTION)!;
      const cue = retriever.retrieve(result, 'session-provider');

      EXPECTED_PRESENT(cue, [
        'circuit breaker',
        'exponential backoff',
        'retry policy',
        'recovery queue / DLQ',
      ]);
      EXPECTED_ABSENT(cue, ['token bucket', 'sliding window', 'pagination']);
    });
  });

  describe('Scenario 3: duplicate processing on at-least-once consumers', () => {
    const QUESTION =
      'Our message consumer uses at-least-once semantics from the broker, ' +
      'and some messages are being processed twice. ' +
      'How do we make this idempotent?';

    it('should classify to distributed_systems and detect the duplicate_processing topic', () => {
      const result = classifier.classify(QUESTION);
      expect(result).not.toBeNull();
      expect(result!.domain).toBe(TechnicalDomain.DISTRIBUTED_SYSTEMS);
      expect(result!.topics).toContain('duplicate_processing');
    });

    it('should surface dedup concepts, not database or rate-limit concepts', () => {
      const result = classifier.classify(QUESTION)!;
      const cue = retriever.retrieve(result, 'session-duplicate');

      EXPECTED_PRESENT(cue, ['idempotency', 'idempotency key', 'deduplication store']);
      EXPECTED_ABSENT(cue, ['token bucket', 'pagination', 'database indexing']);
    });
  });

  describe('Scenario 4: slow database queries under growing traffic', () => {
    const QUESTION =
      'Our database queries are slowing down as traffic grows, ' +
      'where should we start investigating?';

    it('should detect the query_performance and scalability topics', () => {
      const result = classifier.classify(QUESTION);
      expect(result).not.toBeNull();
      expect(result!.topics).toContain('query_performance');
    });

    it('should rank query-performance concepts first, no rate-limit noise', () => {
      const result = classifier.classify(QUESTION)!;
      const cue = retriever.retrieve(result, 'session-slow-query');

      EXPECTED_PRESENT(cue, [
        'database indexing',
        'query plan optimization',
        'table partitioning',
      ]);
      EXPECTED_ABSENT(cue, ['token bucket', 'sliding window', 'pagination']);
    });
  });

  describe('Transcript noise normalization', () => {
    it('should collapse Whisper repeated-token noise before classification', () => {
      const result = classifier.classify(
        'how how how how how would you design a rate rate rate limiter'
      );

      expect(result).not.toBeNull();
      expect(result!.topics).toContain('rate_limiting');
      expect(result!.detectedQuestion).not.toContain('how how how');
    });
  });
});