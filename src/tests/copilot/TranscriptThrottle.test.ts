import { TranscriptThrottle } from '../../electron/frontend/copilot/TranscriptThrottle.js';

describe('TranscriptThrottle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits final events immediately', () => {
    const emitted: any[] = [];
    const throttle = new TranscriptThrottle({ onEmit: (e) => emitted.push(e) });

    throttle.push({ text: 'how would you handle retries', isFinal: true, source: 'system' });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      text: 'how would you handle retries',
      isFinal: true,
      source: 'system',
    });
  });

  it('coalesces partial revisions into a single emission after the delay', () => {
    const emitted: any[] = [];
    const throttle = new TranscriptThrottle({ onEmit: (e) => emitted.push(e) });

    throttle.push({ text: 'how would you', isFinal: false, source: 'system' });
    throttle.push({ text: 'how would you handle', isFinal: false, source: 'system' });
    jest.advanceTimersByTime(500);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].text).toBe('how would you handle');
    expect(emitted[0].isFinal).toBe(false);
  });

  it('suppresses duplicate partial revisions already pending', () => {
    const emitted: any[] = [];
    const throttle = new TranscriptThrottle({ onEmit: (e) => emitted.push(e) });

    throttle.push({ text: 'same phrase', isFinal: false });
    throttle.push({ text: 'same phrase', isFinal: false });
    jest.advanceTimersByTime(500);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].text).toBe('same phrase');
  });

  it('a final event cancels and replaces any pending partial', () => {
    const emitted: any[] = [];
    const throttle = new TranscriptThrottle({ onEmit: (e) => emitted.push(e) });

    throttle.push({ text: 'how would you', isFinal: false });
    throttle.push({ text: 'how would you handle retries', isFinal: true });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      text: 'how would you handle retries',
      isFinal: true,
    });

    jest.advanceTimersByTime(2000);
    expect(emitted).toHaveLength(1);
  });

  it('drops a final identical to the last emitted one', () => {
    const emitted: any[] = [];
    const throttle = new TranscriptThrottle({ onEmit: (e) => emitted.push(e) });

    throttle.push({ text: 'hello', isFinal: true });
    throttle.push({ text: 'hello.', isFinal: true });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].text).toBe('hello');
  });

  it('does not dedupe text arriving after the dedupe window', () => {
    const emitted: any[] = [];
    const throttle = new TranscriptThrottle({ onEmit: (e) => emitted.push(e) });

    throttle.push({ text: 'hello', isFinal: true });
    jest.advanceTimersByTime(6000);
    throttle.push({ text: 'hello', isFinal: true });

    expect(emitted).toHaveLength(2);
  });

  it('flush() emits the pending partial immediately', () => {
    const emitted: any[] = [];
    const throttle = new TranscriptThrottle({ onEmit: (e) => emitted.push(e) });

    throttle.push({ text: 'pending phrase', isFinal: false });
    throttle.flush();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].text).toBe('pending phrase');
    expect(emitted[0].isFinal).toBe(false);
  });

  it('ignores empty text', () => {
    const emitted: any[] = [];
    const throttle = new TranscriptThrottle({ onEmit: (e) => emitted.push(e) });

    throttle.push({ text: '   ', isFinal: true });
    throttle.push({ text: '', isFinal: true });

    expect(emitted).toHaveLength(0);
  });

  it('preserves the source on emitted events', () => {
    const emitted: any[] = [];
    const throttle = new TranscriptThrottle({ onEmit: (e) => emitted.push(e) });

    throttle.push({ text: 'system talk', isFinal: true, source: 'system' });
    throttle.push({ text: 'mic talk', isFinal: true, source: 'microphone' });

    expect(emitted.map((e) => e.source)).toEqual(['system', 'microphone']);
  });
});