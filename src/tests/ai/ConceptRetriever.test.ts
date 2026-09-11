import { ConceptRetriever } from '../../ai/technical-copilot/ConceptRetriever';
import { TechnicalDomain } from '../../ai/technical-copilot/types';
import { TECHNICAL_CONCEPT_CATALOG } from '../../ai/technical-copilot/ConceptCatalog';

describe('ConceptRetriever', () => {
  let retriever: ConceptRetriever;

  beforeEach(() => {
    retriever = new ConceptRetriever();
  });

  describe('Retrieval', () => {
    it('should retrieve concepts for a duplicate-processing question', () => {
      const cue = retriever.retrieve(
        {
          detectedQuestion:
            'How would you prevent duplicate processing if this consumer retries?',
          domain: TechnicalDomain.DISTRIBUTED_SYSTEMS,
          confidence: 0.9,
          matchedKeywords: ['duplicate', 'consumer retry'],
        },
        'session-1'
      );

      expect(cue.concepts.length).toBeGreaterThan(0);
      expect(cue.concepts.length).toBeLessThanOrEqual(6);
      expect(cue.concepts.some((c) => c.includes('idempotency'))).toBe(true);
      expect(cue.category).toBe(TechnicalDomain.DISTRIBUTED_SYSTEMS);
      expect(cue.confidence).toBe(0.9);
    });

    it('should retrieve concepts for a provider-unavailable question', () => {
      const cue = retriever.retrieve(
        {
          detectedQuestion:
            'How would you handle an external provider being unavailable?',
          domain: TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
          confidence: 0.85,
          matchedKeywords: ['circuit breaker', 'backoff'],
        },
        'session-2'
      );

      expect(cue.concepts.length).toBeGreaterThan(0);
      expect(cue.concepts.some((c) => c.includes('backoff'))).toBe(true);
      expect(cue.concepts.some((c) => c.includes('circuit'))).toBe(true);
    });

    it('should return a bounded number of concepts', () => {
      const cue = retriever.retrieve(
        {
          detectedQuestion: 'How would you design this distributed system?',
          domain: TechnicalDomain.SYSTEM_DESIGN,
          confidence: 0.7,
          matchedKeywords: ['scalability', 'latency'],
        },
        'session-3'
      );

      expect(cue.concepts.length).toBeGreaterThan(0);
      expect(cue.concepts.length).toBeLessThanOrEqual(6);
    });

    it('should not crash on an empty matched keyword list', () => {
      const cue = retriever.retrieve(
        {
          detectedQuestion: 'How does this work?',
          domain: TechnicalDomain.OBSERVABILITY,
          confidence: 0.5,
          matchedKeywords: [],
        },
        'session-4'
      );

      expect(cue.concepts.length).toBeGreaterThan(0);
      expect(cue.category).toBe(TechnicalDomain.OBSERVABILITY);
    });
  });

  describe('Domain Concept Retrieval', () => {
    it('should have concept catalog entries for every required domain', () => {
      const requiredDomains = [
        TechnicalDomain.DISTRIBUTED_SYSTEMS,
        TechnicalDomain.API_DESIGN,
        TechnicalDomain.DATABASES_SQL,
        TechnicalDomain.CACHING,
        TechnicalDomain.MESSAGING_QUEUES,
        TechnicalDomain.RELIABILITY_FAULT_TOLERANCE,
        TechnicalDomain.AUTH_AUTHORIZATION,
        TechnicalDomain.CLOUD_INFRASTRUCTURE,
        TechnicalDomain.DEVOPS_CICD,
        TechnicalDomain.OOP_DESIGN,
        TechnicalDomain.ALGORITHMS_DATA_STRUCTURES,
        TechnicalDomain.AI_LLM_SYSTEMS,
        TechnicalDomain.OBSERVABILITY,
        TechnicalDomain.CONCURRENCY,
        TechnicalDomain.SYSTEM_DESIGN,
      ];

      for (const domain of requiredDomains) {
        const hasEntry = TECHNICAL_CONCEPT_CATALOG.some(
          (c) => c.domain === domain
        );
        expect(hasEntry).toBe(true);
      }
    });
  });
});