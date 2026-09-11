import {
  ClassificationResult,
  ConceptCue,
  SessionConfig,
  ConceptEntry,
  DEFAULT_SESSION_CONFIG,
} from './types';
import {
  TECHNICAL_CONCEPT_CATALOG,
  findConceptsByKeywords,
  findRelatedConcepts,
} from './ConceptCatalog';

export class ConceptRetriever {
  private config: SessionConfig;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }

  retrieve(
    classification: ClassificationResult,
    sessionId: string
  ): ConceptCue {
    const directMatches = findConceptsByKeywords(classification.detectedQuestion);

    const domainConcepts = TECHNICAL_CONCEPT_CATALOG.filter(
      (c) => c.domain === classification.domain
    );

    const scored = this.scoreAndDeduplicate(
      directMatches,
      domainConcepts,
      classification.matchedKeywords
    );

    const topConcepts = scored
      .slice(0, this.config.maxConcepts)
      .map((c) => c.label);

    return {
      category: classification.domain,
      detectedQuestion: classification.detectedQuestion,
      concepts: topConcepts,
      confidence: classification.confidence,
      sessionId,
      timestamp: Date.now(),
    };
  }

  retrieveRelated(conceptId: string): string[] {
    return findRelatedConcepts(conceptId).map((c) => c.label);
  }

  private scoreAndDeduplicate(
    directMatches: ConceptEntry[],
    domainConcepts: ConceptEntry[],
    matchedKeywords: string[]
  ): ConceptEntry[] {
    const scored = new Map<string, { concept: ConceptEntry; score: number }>();

    for (const concept of directMatches) {
      const keywordOverlap = concept.keywords.filter((k) =>
        matchedKeywords.some((mk) => k.includes(mk) || mk.includes(k))
      ).length;
      const score = 1.0 + keywordOverlap * 0.3;
      scored.set(concept.id, { concept, score });
    }

    for (const concept of domainConcepts) {
      if (!scored.has(concept.id)) {
        scored.set(concept.id, { concept, score: 0.5 });
      }
    }

    return [...scored.values()]
      .sort((a, b) => b.score - a.score)
      .map((s) => s.concept);
  }
}
