import {
  ConceptCue,
  SessionConfig,
  DEFAULT_SESSION_CONFIG,
  CopilotSession,
} from './types';
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
  private config: SessionConfig;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.classifier = new TechnicalQuestionClassifier(this.config);
    this.retriever = new ConceptRetriever(this.config);
    this.sessionManager = new TranscriptSessionManager(this.config);
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

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      console.warn(
        `[TechnicalCopilot] No active session ${sessionId}`
      );
      return null;
    }

    const updatedSession = this.sessionManager.addFragment(
      sessionId,
      text,
      speaker
    );
    if (!updatedSession) return null;

    const classification = this.classifier.classifyFromFragments(
      updatedSession.fragments
    );

    let cue: ConceptCue | null = null;
    if (classification) {
      cue = this.retriever.retrieve(classification, sessionId);
      updatedSession.lastCue = cue;
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(
      `[TechnicalCopilot] Processed fragment in ${processingTimeMs}ms` +
        (cue ? ` -> ${cue.category} (${cue.concepts.length} concepts)` : ' -> no cue')
    );

    return {
      session: updatedSession,
      cue,
      processingTimeMs,
    };
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

  destroy(): void {
    this.sessionManager.destroy();
  }
}
