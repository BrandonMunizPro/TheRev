import {
  PromptDetection,
  PromptBoundaryType,
  PromptPhase,
  TranscriptFragment,
  SessionConfig,
  DEFAULT_SESSION_CONFIG,
  ConceptCue,
} from './types';
import { findTopicsByKeywords } from './ConceptCatalog';

const SENTENCE_TOKEN_PATTERN = /[\w'-]+/g;

function tokenize(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matches = lower.match(SENTENCE_TOKEN_PATTERN);
  return matches ? matches : [];
}

function containmentSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const aInB = [...tokensA].filter((t) => tokensB.has(t)).length;
  const bInA = [...tokensB].filter((t) => tokensA.has(t)).length;
  return (aInB + bInA) / (tokensA.size + tokensB.size);
}

interface Candidate {
  promptText: string;
  boundaryType: PromptBoundaryType | null;
  confidence: number;
  evidence: string[];
  rejectReasons: string[];
  detectedAt: number;
  stableCount: number;
  fragmentCount: number;
  seenFragments: TranscriptFragment[];
}

export interface EmitDecision {
  shouldEmit: boolean;
  suppressed: boolean;
  suppressionReason?: string;
  dedupeDecision?: string;
  phase: PromptPhase;
}

export class PromptLifecycle {
  private phase: PromptPhase = 'idle';
  private candidate: Candidate | null = null;
  private lastEmittedPromptText: string | null = null;
  private lastEmittedAt: number = 0;
  private config: SessionConfig;

  private fragmentsSinceStable: number = 0;
  private totalStabilizing: number = 0;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }

  getPhase(): PromptPhase {
    return this.phase;
  }

  getCandidate(): Candidate | null {
    return this.candidate ? { ...this.candidate } : null;
  }

  isTerminalPrompt(text: string): boolean {
    if (!text) return false;
    return /[?]\s*$/.test(text.trim());
  }

  onTurnBoundary(): void {
    if (this.candidate && (this.phase === 'candidate' || this.phase === 'stabilizing')) {
      this.candidate = null;
      this.fragmentsSinceStable = 0;
      this.totalStabilizing = 0;
      this.phase = 'idle';
    }
  }

  processDetection(
    detection: PromptDetection,
    fragment: TranscriptFragment,
    lastCue: ConceptCue | null,
    promptText: string | null,
  ): EmitDecision {
    if (!detection.isTechnicalPrompt || !promptText) {
      return {
        shouldEmit: false,
        suppressed: false,
        phase: this.phase,
      };
    }

    const isTerminal = this.isTerminalPrompt(promptText);
    const strongTopicHits = findTopicsByKeywords(promptText);
    const hasStrongTopic =
      strongTopicHits.some((t) => t.score >= 0.75) ||
      (detection.evidence || []).some((e) => e.startsWith('topic:'));

    // A complete, high-confidence prompt with explicit topic evidence is
    // emitted on the first final fragment - it should not wait for another
    // "stabilizing" transcription round. Whisper already batch-completes the
    // phrase, so repeated finals are near-duplicates the dedupe window absorbs.
    const isStrongComplete =
      detection.confidence >= this.config.emitConfidenceHigh &&
      (detection.evidence || []).some((e) => e.startsWith('topic:')) &&
      (detection.boundaryType === 'question' || detection.boundaryType === 'imperative');

    if (detection.confidence < this.config.emitConfidenceHigh) {
      if (!hasStrongTopic || detection.confidence < this.config.emitConfidenceTopicBacked) {
        return {
          shouldEmit: false,
          suppressed: true,
          suppressionReason: `confidence ${detection.confidence} below threshold (high=${this.config.emitConfidenceHigh}, topicBacked=${this.config.emitConfidenceTopicBacked}), hasStrongTopic=${hasStrongTopic}`,
          phase: this.phase,
        };
      }
    }

    if (this.candidate) {
      const sim = containmentSimilarity(this.candidate.promptText, promptText);
      if (sim >= 0.85) {
        this.candidate.stableCount += 1;
        this.candidate.fragmentCount += 1;
        this.candidate.seenFragments.push(fragment);
        this.candidate.confidence = Math.max(this.candidate.confidence, detection.confidence);
        this.candidate.evidence = [
          ...new Set([...this.candidate.evidence, ...detection.evidence]),
        ];
        this.candidate.rejectReasons = [
          ...new Set([...this.candidate.rejectReasons, ...detection.rejectReasons]),
        ];
      } else {
        this.candidate = null;
        this.fragmentsSinceStable = 0;
        this.totalStabilizing = 0;
        this.phase = 'idle';
      }
    }

    if (!this.candidate) {
      this.candidate = {
        promptText,
        boundaryType: detection.boundaryType,
        confidence: detection.confidence,
        evidence: [...detection.evidence],
        rejectReasons: [...detection.rejectReasons],
        detectedAt: fragment.timestamp,
        stableCount: 1,
        fragmentCount: 1,
        seenFragments: [fragment],
      };
      this.phase = 'candidate';
    }

    if (this.candidate.stableCount >= 3) {
      this.phase = 'stabilizing';
    }

    const shouldEmit =
      isTerminal ||
      isStrongComplete ||
      this.candidate.stableCount >= 3 ||
      (this.phase === 'stabilizing' && this.totalStabilizing >= 2);

    if (shouldEmit) {
      const dedupeResult = this.checkDedup(this.candidate.promptText);

      if (dedupeResult.isDuplicate) {
        return {
          shouldEmit: false,
          suppressed: true,
          dedupeDecision: `duplicate of prompt emitted ${Date.now() - this.lastEmittedAt}ms ago (sim=${dedupeResult.similarity.toFixed(2)})`,
          phase: this.phase,
        };
      }

      this.lastEmittedPromptText = this.candidate.promptText;
      this.lastEmittedAt = Date.now();
      const emitted = this.candidate;
      this.candidate = null;
      this.fragmentsSinceStable = 0;
      this.totalStabilizing = 0;
      this.phase = 'emitted';

      void emitted;
      return {
        shouldEmit: true,
        suppressed: false,
        phase: this.phase,
      };
    }

    this.fragmentsSinceStable += 1;
    if (this.phase === 'stabilizing') {
      this.totalStabilizing += 1;
    }

    return {
      shouldEmit: false,
      suppressed: false,
      phase: this.phase,
    };
  }

  private checkDedup(promptText: string): { isDuplicate: boolean; similarity: number } {
    if (!this.lastEmittedPromptText) {
      return { isDuplicate: false, similarity: 0 };
    }

    const timeSinceEmit = Date.now() - this.lastEmittedAt;
    if (timeSinceEmit > this.config.promptDedupeWindowMs) {
      return { isDuplicate: false, similarity: 0 };
    }

    const sim = containmentSimilarity(this.lastEmittedPromptText, promptText);
    return { isDuplicate: sim >= 0.85, similarity: sim };
  }

  reset(): void {
    this.phase = 'idle';
    this.candidate = null;
    this.lastEmittedPromptText = null;
    this.lastEmittedAt = 0;
    this.fragmentsSinceStable = 0;
    this.totalStabilizing = 0;
  }
}