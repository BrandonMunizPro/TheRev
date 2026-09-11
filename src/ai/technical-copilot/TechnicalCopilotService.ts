import {
  ConceptCue,
  SessionConfig,
  DEFAULT_SESSION_CONFIG,
  CopilotSession,
  ClassificationResult,
} from './types';
import { normalizeTranscript } from './TranscriptNormalizer';
import { PromptDetector } from './PromptDetector';
import { PromptLifecycle } from './PromptLifecycle';
import { TechnicalQuestionClassifier } from './TechnicalQuestionClassifier';
import { ConceptRetriever } from './ConceptRetriever';
import { TranscriptSessionManager } from './TranscriptSession';

export interface CopilotProcessResult {
  session: CopilotSession;
  cue: ConceptCue | null;
  processingTimeMs: number;
}

export class TechnicalCopilotService {
  private classifier: TechnicalQuestionClassifier;
  private retriever: ConceptRetriever;
  private sessionManager: TranscriptSessionManager;
  private detector: PromptDetector;
  private config: SessionConfig;

  private lifecycleBySession: Map<string, PromptLifecycle> = new Map();

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.classifier = new TechnicalQuestionClassifier(this.config);
    this.retriever = new ConceptRetriever(this.config);
    this.sessionManager = new TranscriptSessionManager(this.config);
    this.detector = new PromptDetector(this.config);
  }

  startSession(userId: string): CopilotSession {
    return this.sessionManager.createSession(userId);
  }

  processTranscriptFragment(
    sessionId: string,
    text: string,
    speaker?: string
  ): CopilotProcessResult | null {
    const startTime = Date.now();

    const normalizedText = normalizeTranscript(text);
    if (!normalizedText.trim()) {
      console.warn(
        `[TechnicalCopilot] Empty fragment after normalization, skipping (session ${sessionId})`
      );
      return null;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      console.warn(
        `[TechnicalCopilot] No active session ${sessionId}`
      );
      return null;
    }

    const updatedSession = this.sessionManager.addFragment(
      sessionId,
      normalizedText,
      speaker
    );
    if (!updatedSession) return null;

    const lifecycle = this.getOrCreateLifecycle(sessionId);

    const lastSpeaker = updatedSession.lastSpeaker || session.lastSpeaker;
    if (speaker && lastSpeaker && speaker !== lastSpeaker) {
      lifecycle.onTurnBoundary();
      console.log(
        `[TechnicalCopilot] Turn boundary detected: ${lastSpeaker} -> ${speaker}`
      );
    }
    updatedSession.lastSpeaker = speaker;

    const detectStart = Date.now();
    const detection = this.detector.detect(
      normalizedText,
      updatedSession.fragments.slice(-3),
    );
    const detectMs = Date.now() - detectStart;

    const promptText = detection.promptText || normalizedText;

    const fragment = updatedSession.fragments[updatedSession.fragments.length - 1];
    const lastCue = updatedSession.lastCue || null;
    const decision = lifecycle.processDetection(detection, fragment, lastCue, promptText);

    if (decision.suppressed) {
      console.log(
        `[TechnicalCopilot] Prompt suppressed: ${decision.suppressionReason || decision.dedupeDecision || 'lifecycle'}`
      );
    }

    let cue: ConceptCue | null = null;
    let classification: ClassificationResult | null = null;
    let classifyMs = 0;
    let retrieveMs = 0;
    if (decision.shouldEmit) {
      const classifyStart = Date.now();
      classification = this.classifier.classify(promptText);
      if (!classification) {
        const ctxText = updatedSession.fragments
          .slice(-3)
          .map((f) => f.text)
          .join(' ');
        const combined = ctxText && ctxText !== promptText ? `${ctxText} ${promptText}` : promptText;
        classification = this.classifier.classify(combined);
      }
      classifyMs = Date.now() - classifyStart;

      if (classification) {
        const isDev = process.env.NODE_ENV !== 'production';
        const retrieveStart = Date.now();
        cue = this.retriever.retrieve(classification, sessionId, { debug: isDev });
        retrieveMs = Date.now() - retrieveStart;

        if (cue && cue.diagnostics) {
          cue.diagnostics.promptText = promptText;
          cue.diagnostics.boundaryType = detection.boundaryType;
          cue.diagnostics.detectorConfidence = detection.confidence;
          cue.diagnostics.detectorReason = detection.reason;
          cue.diagnostics.detectorEvidence = detection.evidence;
          cue.diagnostics.rejectReasons = detection.rejectReasons;
          cue.diagnostics.suppressionReason = decision.suppressionReason;
          cue.diagnostics.dedupeDecision = decision.dedupeDecision;
          cue.diagnostics.detectMs = detectMs;
          cue.diagnostics.classifyMs = classifyMs;
          cue.diagnostics.retrieveMs = retrieveMs;
        }

        updatedSession.lastCue = cue;
        updatedSession.lastEmittedPromptText = promptText;
        updatedSession.lastEmittedAt = Date.now();
      }
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(
      `[TechnicalCopilot] Processed fragment in ${processingTimeMs}ms` +
        (cue
          ? ` -> ${cue.category} (${cue.concepts.length} concepts, topics: ${classification.topics?.join(', ') || 'none'})`
          : ` -> no cue (phase=${decision.phase})`)
    );

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[CopilotLatency] detect=${detectMs}ms classify=${classifyMs}ms retrieve=${retrieveMs}ms total=${processingTimeMs}ms`
      );
    }

    return {
      session: updatedSession,
      cue,
      processingTimeMs,
    };
  }

  private getOrCreateLifecycle(sessionId: string): PromptLifecycle {
    let lifecycle = this.lifecycleBySession.get(sessionId);
    if (!lifecycle) {
      lifecycle = new PromptLifecycle(this.config);
      this.lifecycleBySession.set(sessionId, lifecycle);
    }
    return lifecycle;
  }

  submitTranscriptBatch(
    sessionId: string,
    fragments: Array<{ text: string; speaker?: string }>
  ): CopilotProcessResult | null {
    if (fragments.length === 0) return null;

    let lastResult: CopilotProcessResult | null = null;
    for (const frag of fragments) {
      lastResult = this.processTranscriptFragment(
        sessionId,
        frag.text,
        frag.speaker
      );
    }
    return lastResult;
  }

  getSession(sessionId: string): CopilotSession | null {
    return this.sessionManager.getSession(sessionId);
  }

  getActiveSessionForUser(userId: string): CopilotSession | null {
    return this.sessionManager.findActiveSession(userId);
  }

  endSession(sessionId: string): boolean {
    this.lifecycleBySession.delete(sessionId);
    return this.sessionManager.closeSession(sessionId);
  }

  getRecentCue(sessionId: string): ConceptCue | null {
    const session = this.sessionManager.getSession(sessionId);
    return session?.lastCue || null;
  }

  getStats(): {
    activeSessions: number;
    totalFragmentsProcessed: number;
  } {
    this.pruneStaleLifecycles();
    const active = this.sessionManager.getActiveSessions();
    const totalFragments = active.reduce(
      (sum, s) => sum + s.fragments.length,
      0
    );
    return {
      activeSessions: active.length,
      totalFragmentsProcessed: totalFragments,
    };
  }

  private pruneStaleLifecycles(): void {
    for (const sessionId of this.lifecycleBySession.keys()) {
      if (!this.sessionManager.getSession(sessionId)) {
        this.lifecycleBySession.delete(sessionId);
      }
    }
  }

  destroy(): void {
    this.sessionManager.destroy();
    this.lifecycleBySession.clear();
  }
}