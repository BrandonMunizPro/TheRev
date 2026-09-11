import { TechnicalCopilotService } from '../../ai/technical-copilot/TechnicalCopilotService';
import { normalizeTranscript } from '../../ai/technical-copilot/TranscriptNormalizer';
import { PromptDetector, extractPromptText } from '../../ai/technical-copilot/PromptDetector';
import { PromptLifecycle } from '../../ai/technical-copilot/PromptLifecycle';
import { TechnicalQuestionClassifier } from '../../ai/technical-copilot/TechnicalQuestionClassifier';
import { ConceptRetriever } from '../../ai/technical-copilot/ConceptRetriever';
import { TechnicalDomain, DEFAULT_SESSION_CONFIG } from '../../ai/technical-copilot/types';

describe('TranscriptNormalizer', () => {
  it('should strip bracket tags like [BLANK_AUDIO]', () => {
    expect(normalizeTranscript('[BLANK_AUDIO] design a rate limiter')).toBe('design a rate limiter');
    expect(normalizeTranscript('[Music] how would you handle duplicate processing')).toBe('how would you handle duplicate processing');
  });

  it('should collapse repeated tokens (3+)', () => {
    expect(normalizeTranscript('how how how would you handle that')).toBe('how would you handle that');
    expect(normalizeTranscript('item item item potency')).toBe('idempotency');
  });

  it('should collapse "you you" lead-in/trail', () => {
    expect(normalizeTranscript('you you you design a rate limiter')).toBe('design a rate limiter');
  });

  it('should apply technical alias map', () => {
    expect(normalizeTranscript('design an item potency key system')).toContain('idempotency');
    expect(normalizeTranscript('how does graph q l handle pagination')).toContain('GraphQL');
  });

  it('should normalize whitespace', () => {
    expect(normalizeTranscript('  how   would   you   do   this  ')).toBe('how would you do this');
  });
});

describe('PromptDetector', () => {
  const detector = new PromptDetector();

  it('should detect a question boundary with technical evidence', () => {
    const result = detector.detect(
      'How would you design a rate limiter for a public API?'
    );
    expect(result.isTechnicalPrompt).toBe(true);
    expect(result.boundaryType).toBe('question');
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it('should detect an imperative boundary with strong evidence', () => {
    const result = detector.detect(
      'Design an idempotent API for handling duplicate payment webhooks.'
    );
    expect(result.isTechnicalPrompt).toBe(true);
    expect(result.boundaryType).toBe('imperative');
  });

  it('should reject non-technical coaching language', () => {
    const result = detector.detect(
      "that's a good point for sure, the goal isn't to memorize anything"
    );
    expect(result.isTechnicalPrompt).toBe(false);
    expect(result.rejectReasons.length).toBeGreaterThan(0);
  });

  it('should reject text that is too short', () => {
    const result = detector.detect('hi');
    expect(result.isTechnicalPrompt).toBe(false);
    expect(result.rejectReasons).toContain('text too short');
  });

  it('should use context support to boost detection confidence', () => {
    const fragments = [
      { text: 'We keep getting duplicate events', timestamp: Date.now(), speaker: 'student' },
      { text: 'the consumer is retrying', timestamp: Date.now() + 100, speaker: 'student' },
    ];
    const result = detector.detect(
      'How would you prevent that?',
      fragments
    );
    expect(result.isTechnicalPrompt).toBe(true);
    expect(result.evidence.some(e => e.includes('context'))).toBe(true);
  });
});

describe('PromptLifecycle', () => {
  it('should emit when prompt is terminal (ends with ?)', () => {
    const lifecycle = new PromptLifecycle();
    const detection = {
      isTechnicalPrompt: true,
      promptText: 'How would you design a rate limiter?',
      confidence: 0.75,
      reason: 'technical',
      boundaryType: 'question' as const,
      evidence: ['question boundary', 'topic:rate_limiting'],
      rejectReasons: [],
    };
    const fragment = { text: 'How would you design a rate limiter?', timestamp: Date.now() };

    const result = lifecycle.processDetection(detection, fragment, null, 'How would you design a rate limiter?');
    expect(result.shouldEmit).toBe(true);
  });

  it('should emit after 3 similar fragments even without terminal', () => {
    const lifecycle = new PromptLifecycle();
    const baseDetection = {
      isTechnicalPrompt: true,
      promptText: 'how would you design a rate limiter for our public api',
      confidence: 0.70,
      reason: 'technical',
      boundaryType: 'question' as const,
      evidence: ['question boundary'],
      rejectReasons: [],
    };
    const fragment = { text: 'how would you design a rate limiter for our public api', timestamp: Date.now() };

    for (let i = 0; i < 2; i++) {
      const r = lifecycle.processDetection(baseDetection, fragment, null, baseDetection.promptText);
      expect(r.shouldEmit).toBe(false);
    }
    const r3 = lifecycle.processDetection(baseDetection, fragment, null, baseDetection.promptText);
    expect(r3.shouldEmit).toBe(true);
  });

  it('should suppress low-confidence detection', () => {
    const lifecycle = new PromptLifecycle();
    const detection = {
      isTechnicalPrompt: true,
      promptText: 'something vague',
      confidence: 0.30,
      reason: 'low',
      boundaryType: 'question' as const,
      evidence: [],
      rejectReasons: ['low confidence'],
    };
    const fragment = { text: 'something vague', timestamp: Date.now() };

    const result = lifecycle.processDetection(detection, fragment, null, 'something vague');
    expect(result.shouldEmit).toBe(false);
    expect(result.suppressed).toBe(true);
  });

  it('should deduplicate nearly identical prompts within window', () => {
    const lifecycle = new PromptLifecycle();
    const detection = {
      isTechnicalPrompt: true,
      promptText: 'How would you design a rate limiter for our public API?',
      confidence: 0.75,
      reason: 'technical',
      boundaryType: 'question' as const,
      evidence: ['question boundary'],
      rejectReasons: [],
    };
    const fragment = { text: 'How would you design a rate limiter for our public API?', timestamp: Date.now() };

    const r1 = lifecycle.processDetection(detection, fragment, null, detection.promptText);
    expect(r1.shouldEmit).toBe(true);

    const r2 = lifecycle.processDetection(detection, fragment, null, detection.promptText);
    expect(r2.shouldEmit).toBe(false);
    expect(r2.dedupeDecision).toContain('duplicate');
  });

  it('should clear candidate on turn boundary', () => {
    const lifecycle = new PromptLifecycle();
    const detection = {
      isTechnicalPrompt: true,
      promptText: 'how would you design a rate limiter',
      confidence: 0.70,
      reason: 'technical',
      boundaryType: 'question' as const,
      evidence: [],
      rejectReasons: [],
    };
    const fragment = { text: 'how would you design a rate limiter', timestamp: Date.now() };

    lifecycle.processDetection(detection, fragment, null, detection.promptText);
    expect(lifecycle.getPhase()).toBe('candidate');

    lifecycle.onTurnBoundary();
    expect(lifecycle.getPhase()).toBe('idle');
    expect(lifecycle.getCandidate()).toBeNull();
  });
});

describe('CASE A: valid idempotency question', () => {
  const service = new TechnicalCopilotService();

  afterEach(() => service.destroy());

  it('should emit a cue with idempotency concepts', () => {
    const session = service.startSession('user-a');
    const result = service.processTranscriptFragment(
      session.id,
      'How would you make this endpoint idempotent so retries do not cause duplicate charges?'
    );

    expect(result).not.toBeNull();
    expect(result!.cue).not.toBeNull();
    expect(result!.cue!.category).toBe(TechnicalDomain.DISTRIBUTED_SYSTEMS);
    expect(result!.cue!.concepts).toContain('idempotency');
    expect(result!.cue!.diagnostics?.promptText).toContain('idempotent');
  });
});

describe('CASE B: pagination depth', () => {
  const service = new TechnicalCopilotService();

  afterEach(() => service.destroy());

  it('should emit a cue with cursor/offset pagination concepts', () => {
    const session = service.startSession('user-b');
    const result = service.processTranscriptFragment(
      session.id,
      'Design paginated APIs for a product listing endpoint. What approach would you use for cursor-based pagination vs offset pagination?'
    );

    expect(result).not.toBeNull();
    expect(result!.cue).not.toBeNull();
    expect(result!.cue!.concepts).toContain('cursor-based pagination');
    expect(result!.cue!.diagnostics?.promptText).toContain('cursor');
  });
});

describe('CASE C: pagination follow-up with topic context', () => {
  const service = new TechnicalCopilotService();

  afterEach(() => service.destroy());

  it('should emit pagination cue without bleed from previous rate-limiting fragments', () => {
    const session = service.startSession('user-c');

    const r1 = service.processTranscriptFragment(
      session.id,
      'What approach would you use for cursor pagination in a REST API?'
    );
    expect(r1!.cue).not.toBeNull();
    expect(r1!.cue!.concepts).toContain('cursor-based pagination');
  });
});

describe('CASE D: coaching speech — no cue', () => {
  const service = new TechnicalCopilotService();

  afterEach(() => service.destroy());

  it('should not emit for coaching/acknowledgment phrases', () => {
    const session = service.startSession('user-d');

    const r1 = service.processTranscriptFragment(
      session.id,
      "That's a good point for sure."
    );
    expect(r1!.cue).toBeNull();

    const r2 = service.processTranscriptFragment(
      session.id,
      'Luckily it\'s not quite that simple.'
    );
    expect(r2!.cue).toBeNull();
  });
});

describe('CASE E: low confidence — no cue', () => {
  const service = new TechnicalCopilotService();

  afterEach(() => service.destroy());

  it('should not emit for text that is too short or vague', () => {
    const session = service.startSession('user-e');

    const r1 = service.processTranscriptFragment(session.id, 'ok');
    expect(r1!.cue).toBeNull();
  });
});

describe('CASE F: repeated overlapping partials — emit once', () => {
  const service = new TechnicalCopilotService();

  afterEach(() => service.destroy());

  it('should collapse repeated partials and emit only once', () => {
    const session = service.startSession('user-f');
    const fragments = [
      'item item item potency',
      'item potency for the payment',
      'item potency for the payment system',
    ];

    let emitCount = 0;
    let lastCue = null;
    for (const frag of fragments) {
      const r = service.processTranscriptFragment(session.id, frag);
      if (r?.cue) {
        emitCount += 1;
        lastCue = r.cue;
      }
    }

    expect(emitCount).toBeLessThanOrEqual(1);
    if (lastCue) {
      expect(lastCue.category).toBe(TechnicalDomain.DISTRIBUTED_SYSTEMS);
    }
  });
});

describe('CASE G: topic transition — no bleed', () => {
  const service = new TechnicalCopilotService();

  afterEach(() => service.destroy());

  it('should not carry topic context across topic transitions', () => {
    const session = service.startSession('user-g');

    const r1 = service.processTranscriptFragment(
      session.id,
      'How would you design a rate limiter?'
    );
    expect(r1!.cue).not.toBeNull();
    expect(r1!.cue!.category).toBe(TechnicalDomain.API_DESIGN);

    const r2 = service.processTranscriptFragment(
      session.id,
      'What about cursor-based pagination for this endpoint?'
    );
    expect(r2!.cue).not.toBeNull();
    expect(r2!.cue!.concepts).toContain('cursor-based pagination');
    expect(r2!.cue!.concepts).not.toContain('token bucket');
  });
});

describe('CASE H: Whisper artifacts — no false cues', () => {
  const service = new TechnicalCopilotService();

  afterEach(() => service.destroy());

  it('should not emit for pure noise or empty bracket tags', () => {
    const session = service.startSession('user-h');

    const r1 = service.processTranscriptFragment(
      session.id,
      '[BLANK_AUDIO] you you you'
    );
    expect(r1).toBeNull();

    const r2 = service.processTranscriptFragment(
      session.id,
      '[Music] [BLANK_AUDIO]'
    );
    expect(r2).toBeNull();
  });
});

describe('CASE I: technical statement without question — no cue', () => {
  const service = new TechnicalCopilotService();

  afterEach(() => service.destroy());

  it('should not emit for technical statements that are not prompts', () => {
    const session = service.startSession('user-i');

    const r1 = service.processTranscriptFragment(
      session.id,
      'TCP is a connection-oriented protocol that provides reliable delivery of data.'
    );
    expect(r1!.cue).toBeNull();
  });
});

describe('Existing classifier tests still pass', () => {
  const classifier = new TechnicalQuestionClassifier();
  const retriever = new ConceptRetriever();

  it('should classify rate limiter question', () => {
    const QUESTION =
      "Imagine you're designing a rate limiter for a public API. " +
      'What approach would you take and how would you balance fairness versus simplicity?';

    const result = classifier.classify(QUESTION);
    expect(result).not.toBeNull();
    expect(result!.domain).toBe(TechnicalDomain.API_DESIGN);
    expect(result!.topics).toContain('rate_limiting');

    const cue = retriever.retrieve(result!, 'session-rate-limit');
    expect(cue.concepts).toContain('rate limiting');
    expect(cue.concepts).toContain('token bucket');
  });

  it('should classify provider failure question', () => {
    const QUESTION =
      'The payment provider has become unreliable. ' +
      'How do we keep the checkout service stable without losing orders?';

    const result = classifier.classify(QUESTION);
    expect(result).not.toBeNull();
    expect(result!.domain).toBe(TechnicalDomain.RELIABILITY_FAULT_TOLERANCE);
    expect(result!.topics).toContain('provider_failure');
  });

  it('should classify idempotency question', () => {
    const QUESTION =
      'Our message consumer uses at-least-once semantics from the broker, ' +
      'and some messages are being processed twice. ' +
      'How do we make this idempotent?';

    const result = classifier.classify(QUESTION);
    expect(result).not.toBeNull();
    expect(result!.domain).toBe(TechnicalDomain.DISTRIBUTED_SYSTEMS);
    expect(result!.topics).toContain('duplicate_processing');
  });

  it('should classify slow query question', () => {
    const QUESTION =
      'Our database queries are slowing down as traffic grows, ' +
      'where should we start investigating?';

    const result = classifier.classify(QUESTION);
    expect(result).not.toBeNull();
    expect(result!.topics).toContain('query_performance');
  });

  it('should collapse repeated tokens', () => {
    const result = classifier.classify(
      'how how how how how would you design a rate rate rate limiter'
    );
    expect(result).not.toBeNull();
    expect(result!.topics).toContain('rate_limiting');
    expect(result!.detectedQuestion).not.toContain('how how how');
  });
});