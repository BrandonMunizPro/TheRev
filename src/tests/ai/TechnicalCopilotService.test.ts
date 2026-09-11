import { TechnicalCopilotService } from '../../ai/technical-copilot/TechnicalCopilotService';
import { TechnicalDomain } from '../../ai/technical-copilot/types';

describe('TechnicalCopilotService', () => {
  let service: TechnicalCopilotService;

  beforeEach(() => {
    service = new TechnicalCopilotService({
      maxContextFragments: 10,
      sessionTimeoutMs: 60 * 1000,
    });
  });

  afterEach(() => {
    service.destroy();
  });

  describe('Session Management', () => {
    it('should start a session for a user', () => {
      const session = service.startSession('user-1');
      expect(session.id).toBeTruthy();
      expect(session.isActive).toBe(true);
    });

    it('should end a session', () => {
      const session = service.startSession('user-1');
      expect(service.endSession(session.id)).toBe(true);
      expect(service.getSession(session.id)).toBeNull();
    });
  });

  describe('End-to-End Transcript Processing', () => {
    it('should surface a cue for a technical question', () => {
      const session = service.startSession('user-1');

      const result = service.processTranscriptFragment(
        session.id,
        'How would you prevent duplicate processing if this consumer retries?'
      );

      expect(result).not.toBeNull();
      expect(result!.cue).not.toBeNull();
      expect(result!.cue!.concepts.length).toBeGreaterThan(0);
      expect(result!.cue!.category).toBe(TechnicalDomain.DISTRIBUTED_SYSTEMS);
      expect(result!.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return null cue for an irrelevant fragment', () => {
      const session = service.startSession('user-1');

      const result = service.processTranscriptFragment(
        session.id,
        'Can you pass the salt, thanks'
      );

      expect(result).not.toBeNull();
      expect(result!.cue).toBeNull();
    });

    it('should process a batch of fragments and keep the last cue', () => {
      const session = service.startSession('user-1');

      const result = service.submitTranscriptBatch(session.id, [
        { text: 'The provider has been flaky lately.' },
        {
          text:
            'How would you handle when an external provider is unavailable?',
        },
      ]);

      expect(result).not.toBeNull();
      expect(result!.cue).not.toBeNull();
      expect(result!.session.fragments).toHaveLength(2);
    });

    it('should use rolling context across consecutive fragments', () => {
      const session = service.startSession('user-1');

      const fragments = [
        'We keep getting duplicate events in our queue.',
        'Every time the consumer retries we see the same job again.',
        'How would you prevent that from causing double work?',
      ];

      let lastCue = null;
      for (const fragment of fragments) {
        const result = service.processTranscriptFragment(session.id, fragment);
        if (result?.cue) lastCue = result.cue;
      }

      expect(lastCue).not.toBeNull();
      expect(lastCue!.category).toBe(TechnicalDomain.DISTRIBUTED_SYSTEMS);
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle processing with an invalid session gracefully', () => {
      const result = service.processTranscriptFragment(
        'invalid-session',
        'How would you handle retries?'
      );

      expect(result).toBeNull();
    });

    it('should not crash the service after invalid operations', () => {
      service.processTranscriptFragment(
        'invalid-session',
        'How would you handle retries?'
      );
      service.endSession('invalid-session');

      const session = service.startSession('user-2');
      const result = service.processTranscriptFragment(
        session.id,
        'How would you design this API for rate limiting?'
      );

      expect(result).not.toBeNull();
      expect(result!.cue).not.toBeNull();
    });
  });

  describe('Retrieval Failure Fallback', () => {
    it('should return a null cue (no crash) when no concepts match', () => {
      const session = service.startSession('user-3');
      const result = service.processTranscriptFragment(
        session.id,
        'Can you explain the latest memes to me?'
      );

      expect(result).not.toBeNull();
      expect(result!.cue).toBeNull();
    });
  });

  describe('Stats', () => {
    it('should track active sessions', () => {
      service.startSession('user-1');
      service.startSession('user-2');

      const stats = service.getStats();
      expect(stats.activeSessions).toBeGreaterThan(0);
    });
  });
});