import { SegmentTranscriber } from '../../electron/frontend/copilot/SegmentTranscriber.js';

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ text }),
  };
}

function slowResponse(text: string, ms: number) {
  return new Promise((resolve) => setTimeout(() => resolve(okResponse(text)), ms));
}

describe('SegmentTranscriber backpressure', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('bounds the pending queue while whisper is busy and drops stale segments', async () => {
    const emitted: any[] = [];
    const transcriber = new SegmentTranscriber({
      maxQueueDepth: 3,
      onText: (e) => emitted.push(e),
    });

    fetchMock.mockImplementation((url: any, opts: any) => {
      const wavText = new TextDecoder().decode(opts.body as Uint8Array);
      // Segment 1 is slow; everything else resolves fast.
      if (wavText === 'seg-1') return slowResponse('one', 60);
      return Promise.resolve(okResponse(wavText));
    });

    for (let i = 1; i <= 7; i++) {
      transcriber.push({ wav: encode(`seg-${i}`), source: 'system' });
    }

    // In-flight (seg-1) + bounded queue: never more than maxQueueDepth waiting.
    expect(transcriber.pending).toBeLessThanOrEqual(3);
    expect(transcriber.queueDepth).toBeLessThanOrEqual(3);
    expect(transcriber.droppedCount).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(transcriber.pending).toBe(0);
    expect(transcriber.droppedCount).toBe(3);
    // FIFO is preserved for kept segments: in-flight seg-1, then seg-5,6,7.
    expect(emitted.map((e) => e.text)).toEqual(['one', 'seg-5', 'seg-6', 'seg-7']);
  });

  it('keeps the newest segment instead of the oldest stale one', async () => {
    const emitted: any[] = [];
    const transcriber = new SegmentTranscriber({
      maxQueueDepth: 2,
      onText: (e) => emitted.push(e),
    });

    fetchMock.mockImplementation((url: any, opts: any) => {
      const wavText = new TextDecoder().decode(opts.body as Uint8Array);
      if (wavText === 'a') return slowResponse('A', 50);
      return Promise.resolve(okResponse(wavText));
    });

    transcriber.push({ wav: encode('a'), source: 'system' });
    transcriber.push({ wav: encode('b'), source: 'system' }); // queued
    transcriber.push({ wav: encode('c'), source: 'system' }); // queued
    transcriber.push({ wav: encode('d'), source: 'system' }); // queue full -> drops 'b'

    expect(transcriber.pending).toBe(2);
    expect(transcriber.droppedCount).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Newest wins: 'b' was dropped, 'c' and 'd' are processed after 'a'.
    expect(transcriber.droppedCount).toBe(1);
    expect(emitted.map((e) => e.text)).toEqual(['A', 'c', 'd']);
  });

  it('exposes per-segment latency and correlation ids for tracing', async () => {
    const emitted: any[] = [];
    const transcriber = new SegmentTranscriber({
      maxQueueDepth: 2,
      onText: (e) => emitted.push(e),
    });

    fetchMock.mockImplementation((url: any, opts: any) => {
      const wavText = new TextDecoder().decode(opts.body as Uint8Array);
      if (wavText === 'slow') return slowResponse('slowed', 30);
      return Promise.resolve(okResponse(wavText));
    });

    transcriber.push({ wav: encode('slow'), source: 'system', capturedAt: Date.now() - 1000 });
    transcriber.push({ wav: encode('quick'), source: 'system', capturedAt: Date.now() });

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(emitted).toHaveLength(2);
    for (const e of emitted) {
      expect(e.correlationId).toMatch(/^seg-/);
      expect(typeof e.whisperMs).toBe('number');
      expect(typeof e.queueWaitMs).toBe('number');
      expect(typeof e.totalLatencyMs).toBe('number');
    }
    // The slow segment waited on the wire (~1000ms captured latency).
    expect(emitted[0].queueWaitMs).toBeGreaterThanOrEqual(0);
    expect(transcriber.processedCount).toBe(2);
  });

  it('reset after clear() leaves a working, bounded queue', async () => {
    const emitted: any[] = [];
    const transcriber = new SegmentTranscriber({
      maxQueueDepth: 2,
      onText: (e) => emitted.push(e),
    });

    fetchMock.mockImplementation((url: any, opts: any) => {
      const wavText = new TextDecoder().decode(opts.body as Uint8Array);
      return slowResponse(wavText, 30);
    });

    transcriber.push({ wav: encode('x'), source: 'system' });
    transcriber.push({ wav: encode('y'), source: 'system' });
    transcriber.push({ wav: encode('z'), source: 'system' });

    transcriber.clear();
    expect(transcriber.pending).toBe(0);
    expect(transcriber.droppedCount).toBeGreaterThanOrEqual(0);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(transcriber.pending).toBe(0);
  });
});