import { TechnicalCopilotService } from '../../ai/technical-copilot/TechnicalCopilotService';
import { TechnicalQuestionClassifier } from '../../ai/technical-copilot/TechnicalQuestionClassifier';

const PRESENT = (cue: { concepts: string[] } | null, labels: string[]) => {
  expect(cue).not.toBeNull();
  for (const label of labels) {
    expect(cue!.concepts).toContain(label);
  }
};

const ABSENT = (cue: { concepts: string[] } | null, labels: string[]) => {
  expect(cue).not.toBeNull();
  for (const label of labels) {
    expect(cue!.concepts).not.toContain(label);
  }
};

describe('Phase 3B regression scenarios', () => {
  const service = new TechnicalCopilotService();
  const classifier = new TechnicalQuestionClassifier();

  afterAll(() => service.destroy());

  it('A: idempotency - emits instantly with answer anchors', () => {
    const session = service.startSession('p3b-a');
    const result = service.processTranscriptFragment(
      session.id,
      'How would you make this endpoint idempotent so retries do not cause duplicate charges?'
    );

    expect(result?.cue).not.toBeNull();
    PRESENT(result?.cue ?? null, ['idempotency', 'idempotency key', 'deduplication store']);

    // Confidence is reproduced from the same evidence the classifier uses.
    const classification = classifier.classify(
      'How would you make this endpoint idempotent so retries do not cause duplicate charges?'
    );
    expect(classification).not.toBeNull();
    expect(result!.cue!.confidence).toBe(classification!.confidence);
    expect(result!.cue!.confidence).toBeGreaterThan(0);
    expect(result!.cue!.confidence).toBeLessThanOrEqual(1);
  });

  it('B: zero downtime migration - emits with migration anchors', () => {
    const session = service.startSession('p3b-b');
    const result = service.processTranscriptFragment(
      session.id,
      'How would you approach a zero downtime migration for our database?'
    );

    expect(result?.cue).not.toBeNull();
    PRESENT(result?.cue ?? null, ['expand-contract migration', 'dual write & backfill']);
    expect(result!.cue!.concepts.length).toBeGreaterThanOrEqual(4);
  });

  it('C: provider failure - surfaces recovery patterns, not rate-limit noise', () => {
    const session = service.startSession('p3b-c');
    let cue: any = null;
    for (let i = 0; i < 3; i++) {
      const r = service.processTranscriptFragment(
        session.id,
        'The payment provider has become unreliable. How do we keep the checkout service stable without losing orders?'
      );
      if (r?.cue) cue = r.cue;
    }

    PRESENT(cue, ['circuit breaker', 'exponential backoff', 'retry policy', 'recovery queue / DLQ']);
    ABSENT(cue, ['token bucket', 'sliding window', 'pagination']);
  });

  it('D: traffic spike - emits overload anchors plus related load concepts', () => {
    const session = service.startSession('p3b-d');
    const result = service.processTranscriptFragment(
      session.id,
      'How would you handle a sudden spike in traffic hitting a public API?'
    );

    expect(result?.cue).not.toBeNull();
    PRESENT(result?.cue ?? null, [
      'request queue / buffering',
      'reject under overload (fail fast)',
      'cache-heavy reads for spikes',
      'load shedding',
    ]);
    // Deterministic, bounded cue depth (min 4, never padded past 6).
    expect(result!.cue!.concepts.length).toBeGreaterThanOrEqual(4);
    expect(result!.cue!.concepts.length).toBeLessThanOrEqual(6);
  });

  it('E: pagination - emits deep cursor/offset anchors', () => {
    const session = service.startSession('p3b-e');
    const result = service.processTranscriptFragment(
      session.id,
      'What approach would you use for cursor pagination versus offset pagination in a REST API?'
    );

    expect(result?.cue).not.toBeNull();
    PRESENT(result?.cue ?? null, [
      'cursor-based pagination',
      'offset pagination',
      'stable sort key',
      'next cursor / next page link',
    ]);
  });

  it('F: no prompt - emits nothing (no stray cues)', () => {
    const session = service.startSession('p3b-f');

    const r1 = service.processTranscriptFragment(
      session.id,
      "That's a good point for sure, let's keep going."
    );
    expect(r1?.cue).toBeNull();

    const r2 = service.processTranscriptFragment(
      session.id,
      'OK moving on to the next item in the agenda.'
    );
    expect(r2?.cue).toBeNull();
  });
});

describe('Phase 3B long-session behavior', () => {
  const service = new TechnicalCopilotService();

  afterAll(() => service.destroy());

  it('keeps session + lifecycle state bounded and still processes late prompts', () => {
    const session = service.startSession('p3b-long');

    for (let i = 0; i < 60; i++) {
      const r = service.processTranscriptFragment(
        session.id,
        `ok moving on to the next bullet point here number ${i}`
      );
      expect(r).not.toBeNull();
      expect(r!.cue).toBeNull();
    }

    // Fragments are capped to the session config, so memory stays flat.
    expect(session.fragments.length).toBeLessThanOrEqual(20);

    // A late, distinct strong prompt is still processed (no starvation).
    const late = service.processTranscriptFragment(
      session.id,
      'How would you approach a zero downtime migration for our database?'
    );
    expect(late?.cue).not.toBeNull();
    expect(late!.cue!.concepts.length).toBeGreaterThanOrEqual(4);

    // Repeating the same phrase does not create a cue storm (dedupe window).
    let cueCount = 0;
    for (let i = 0; i < 3; i++) {
      const r = service.processTranscriptFragment(
        session.id,
        'How would you approach a zero downtime migration for our database?'
      );
      if (r?.cue) cueCount += 1;
    }
    expect(cueCount).toBeLessThanOrEqual(1);

    const stats = service.getStats();
    expect(stats.activeSessions).toBe(1);
    expect(stats.totalFragmentsProcessed).toBeLessThanOrEqual(20);

    service.endSession(session.id);
  });

  it('closed sessions are removed and their lifecycle state is pruned', () => {
    const session = service.startSession('p3b-end');
    service.processTranscriptFragment(
      session.id,
      'How would you make this endpoint idempotent so retries do not cause duplicate charges?'
    );

    expect(service.endSession(session.id)).toBe(true);
    expect(service.getSession(session.id)).toBeNull();

    const stats = service.getStats();
    expect(stats.activeSessions).toBe(0);
  });
});