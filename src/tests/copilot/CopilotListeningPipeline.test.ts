import { TranscriptThrottle } from '../../electron/frontend/copilot/TranscriptThrottle.js';
import { CopilotListeningPipeline } from '../../electron/frontend/copilot/CopilotListeningPipeline.js';

class FakeCapture {
  started = false;
  stopped = false;
  disposed = false;
  error: Error | null = null;
  lastSource: string | null = null;
  onSegment: ((segment: any) => void) | null = null;
  onState: ((state: string) => void) | null = null;
  onError: ((err: Error) => void) | null = null;
  onActivity: ((active: boolean) => void) | null = null;

  async start(source: string) {
    this.lastSource = source;
    if (this.error) throw this.error;
    this.started = true;
    this.onState?.('listening');
    return true;
  }

  stop() {
    this.stopped = true;
    this.onState?.('stopped');
  }

  dispose() {
    this.disposed = true;
  }

  emitSegment(text: string, source = 'system') {
    this.onSegment?.({
      wav: new TextEncoder().encode(text),
      durationMs: 1000,
      source,
    });
  }
}

class FakeTranscriber {
  disposed = false;
  error: Error | null = null;
  pushed: any[] = [];
  onText: ((event: any) => void) | null = null;
  onError: ((err: Error) => void) | null = null;

  push(segment: any) {
    if (this.disposed) return;
    this.pushed.push(segment);
    Promise.resolve().then(() => {
      if (this.disposed) return;
      if (this.error) {
        this.onError?.(this.error);
        return;
      }
      const text = new TextDecoder().decode(segment.wav as Uint8Array).trim();
      this.onText?.({ text, source: segment.source, isFinal: true });
    });
  }

  clear() {}
  dispose() {
    this.disposed = true;
  }
}

function errorWithCode(code: string) {
  const err = new Error(code);
  (err as any).code = code;
  return err;
}

describe('CopilotListeningPipeline', () => {
  let capture: FakeCapture;
  let transcriber: FakeTranscriber;
  let handler: jest.Mock;
  let onError: jest.Mock;
  let onState: jest.Mock;

  function makePipeline(source = 'system') {
    capture = new FakeCapture();
    transcriber = new FakeTranscriber();
    handler = jest.fn();
    onError = jest.fn();
    onState = jest.fn();
    return new CopilotListeningPipeline({
      capture,
      transcriber,
      throttle: new TranscriptThrottle(),
      source,
      onEvent: handler,
      onError,
      onState,
    });
  }

  it('starts the capture with the requested source and reaches listening', async () => {
    const pipeline = makePipeline('system');
    await pipeline.start();

    expect(capture.started).toBe(true);
    expect(capture.lastSource).toBe('system');
    expect(pipeline.state).toBe('listening');
  });

  it('routes microphonic/system segments through transcription to the handler as finals', async () => {
    const pipeline = makePipeline('system');
    await pipeline.start();

    capture.emitSegment('how would you handle retries', 'system');

    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event).toMatchObject({
      text: 'how would you handle retries',
      source: 'system',
      isFinal: true,
    });
  });

  it('deduplicates repeated identical segment transcriptions before emission', async () => {
    const pipeline = makePipeline('system');
    await pipeline.start();

    capture.emitSegment('hello', 'system');
    await new Promise((resolve) => setImmediate(resolve));
    capture.emitSegment('hello.', 'system');
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('labels microphone segments with the microphone source', async () => {
    const pipeline = makePipeline('microphone');
    await pipeline.start();

    capture.emitSegment('talking on mic', 'microphone');
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler.mock.calls[0][0].source).toBe('microphone');
  });

  it('returns false and reports an error if the source cannot be acquired', async () => {
    const pipeline = makePipeline('system');
    capture.error = errorWithCode('system-audio-unsupported');

    const ok = await pipeline.start();

    expect(ok).toBe(false);
    expect(capture.started).toBe(false);
    expect(pipeline.state).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].code).toBe('system-audio-unsupported');
  });

  it('stop() stops capture, flushes pending work, and reports stopped', async () => {
    const pipeline = makePipeline('system');
    await pipeline.start();

    pipeline.stop();

    expect(capture.stopped).toBe(true);
    expect(pipeline.state).toBe('stopped');
  });

  it('propagates transcriber errors without tearing down the pipeline', async () => {
    const pipeline = makePipeline('system');
    await pipeline.start();

    transcriber.error = new Error('transcriber failed');
    capture.emitSegment('fake segment', 'system');
    await new Promise((resolve) => setImmediate(resolve));

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'transcriber failed' })
    );
    expect(pipeline.state).toBe('listening');
  });

  it('dispose() detaches the wiring so late segments are not delivered', async () => {
    const pipeline = makePipeline('system');
    await pipeline.start();

    pipeline.dispose();
    capture.emitSegment('after dispose', 'system');
    await new Promise((resolve) => setImmediate(resolve));

    expect(capture.disposed).toBe(true);
    expect(transcriber.disposed).toBe(true);
    expect(transcriber.pushed).toHaveLength(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it('restarts cleanly after an error', async () => {
    const pipeline = makePipeline('system');
    capture.error = errorWithCode('system-audio-unsupported');

    expect(await pipeline.start()).toBe(false);

    capture.error = null;
    expect(await pipeline.start()).toBe(true);
    expect(pipeline.state).toBe('listening');
  });
});