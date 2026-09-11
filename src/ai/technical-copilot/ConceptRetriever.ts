import {
  ClassificationResult,
  ConceptCue,
  SessionConfig,
  ConceptEntry,
  DEFAULT_SESSION_CONFIG,
  CopilotDiagnostics,
  RankedConcept,
} from './types';
import {
  TECHNICAL_CONCEPT_CATALOG,
  findConceptsByKeywords,
  findRelatedConcepts,
  findConceptsByTopics,
} from './ConceptCatalog';

export class ConceptRetriever {
  private config: SessionConfig;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }

  retrieve(
    classification: ClassificationResult,
    sessionId: string,
    options?: { debug?: boolean }
  ): ConceptCue {
    const text = (classification.normalizedText || classification.detectedQuestion).toLowerCase();
    const topics = classification.topics || [];
    const directMatches = findConceptsByKeywords(text);

    const {
      ranked,
      diagnostics,
    } = this.buildRankedCandidates(text, topics, directMatches, classification);

    const topConcepts = ranked
      .slice(0, this.config.maxConcepts)
      .map((r) => r.label);

    const cue: ConceptCue = {
      category: classification.domain,
      detectedQuestion: classification.detectedQuestion,
      concepts: topConcepts,
      confidence: classification.confidence,
      sessionId,
      timestamp: Date.now(),
    };

    if (options?.debug && diagnostics) {
      cue.diagnostics = diagnostics;
    }

    return cue;
  }

  retrieveRelated(conceptId: string): string[] {
    return findRelatedConcepts(conceptId).map((c) => c.label);
  }

  private buildRankedCandidates(
    text: string,
    topics: string[],
    directMatches: ConceptEntry[],
    classification: ClassificationResult,
  ): {
    ranked: RankedConcept[];
    diagnostics?: CopilotDiagnostics;
  } {
    const scored = new Map<string, { concept: ConceptEntry; score: number; reasons: string[] }>();

    const addScore = (concept: ConceptEntry, delta: number, reason: string) => {
      const existing = scored.get(concept.id);
      if (existing) {
        existing.score += delta;
        existing.reasons.push(reason);
      } else {
        scored.set(concept.id, { concept, score: delta, reasons: [reason] });
      }
    };

    const directIds = new Set(directMatches.map((c) => c.id));

    if (topics.length > 0) {
      const topicConcepts = findConceptsByTopics(topics);
      for (const concept of topicConcepts) {
        addScore(concept, 0.7, `topic:${concept.topic}`);
      }

      for (const concept of directMatches) {
        if (!topicConcepts.some((tc) => tc.id === concept.id)) {
          const hits = concept.keywords.filter((k) =>
            text.includes(k.toLowerCase())
          ).length;
          const labelHit = text.includes(concept.label.toLowerCase());
          if (hits >= 2 || labelHit) {
            addScore(concept, 0.85, 'text+topic-general');
          }
        }
      }
    } else {
      const domainConcepts = TECHNICAL_CONCEPT_CATALOG.filter(
        (c) => c.domain === classification.domain
      );
      for (const concept of domainConcepts) {
        const inDirect = directIds.has(concept.id);
        addScore(concept, inDirect ? 0.9 : 0.35, inDirect ? 'text+domain-fallback' : `domain-fallback:${classification.domain}`);
      }
      for (const concept of directMatches) {
        if (!domainConcepts.some((dc) => dc.id === concept.id)) {
          addScore(concept, 0.85, 'text-foreign');
        }
      }
    }

    for (const concept of directMatches) {
      const hits = concept.keywords.filter((k) =>
        text.includes(k.toLowerCase())
      ).length;
      const labelHits = text.includes(concept.label.toLowerCase()) ? 1 : 0;
      const totalHits = hits + labelHits;
      if (totalHits > 0) {
        addScore(concept, 0.4 + 0.2 * (totalHits - 1), 'text-term-match');
      }
    }

    const topForRelated = [...scored.values()]
      .filter((s) => s.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    for (const entry of topForRelated) {
      for (const relId of entry.concept.relatedConcepts) {
        const relConcept = TECHNICAL_CONCEPT_CATALOG.find(
          (c) => c.id === relId || c.label.toLowerCase() === relId.toLowerCase()
        );
        if (relConcept && !scored.has(relConcept.id)) {
          addScore(relConcept, 0.15, `related:${entry.concept.id}`);
        }
      }
    }

    const ranked: RankedConcept[] = [...scored.values()]
      .map((s) => ({
        s,
        textHits: s.concept.keywords.filter((k) =>
          text.includes(k.toLowerCase())
        ).length,
      }))
      .sort(
        (a, b) =>
          b.s.score - a.s.score ||
          // Tie-break: concepts whose own keywords appear in the prompt are the
          // answer anchors - prefer them over same-confidence topic echo.
          b.textHits - a.textHits
      )
      .map(({ s }) => ({
        id: s.concept.id,
        label: s.concept.label,
        score: Math.round(s.score * 1000) / 1000,
        topic: s.concept.topic,
        reasons: s.reasons,
      }));

    const diagnostics: CopilotDiagnostics = {
      normalizedText: text,
      domains: classification.domainScores || [{ domain: classification.domain, score: classification.confidence }],
      topics: classification.topicScores || [],
      rankedConcepts: ranked,
    };

    return { ranked, diagnostics };
  }
}
