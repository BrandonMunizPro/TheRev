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

describe('SegmentTranscriber', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('transcribes queued segments serially in FIFO order', async () => {
    const results: string[] = [];

    fetchMock.mockImplementationOnce(() => okResponse('first'));
    fetchMock.mockImplementationOnce(() => okResponse('second'));

    await new Promise<void>((resolve) => {
      const transcriber = new SegmentTranscriber({
        onText: (e) => {
          results.push(e.text);
          if (results.length === 2) resolve();
        },
      });
      transcriber.push({ wav: encode('first segment'), source: 'system' });
      transcriber.push({ wav: encode('second segment'), source: 'system' });
    });

    expect(results).toEqual(['first', 'second']);
  });

  it('keeps FIFO order even when the first request would resolve slowly', async () => {
    const results: string[] = [];
    const transcriber = new SegmentTranscriber({ onText: (e) => results.push(e.text) });

    fetchMock.mockImplementation((url: any, opts: any) => {
      const text = new TextDecoder().decode(opts.body as Uint8Array);
      if (text === 'slow') {
        return new Promise((resolve) => {
          setTimeout(() => resolve(okResponse('slow')), 30);
        });
      }
      return Promise.resolve(okResponse('fast'));
    });

    await new Promise<void>((resolve) => {
      transcriber.onText = (e) => {
        results.push(e.text);
        if (results.length === 2) resolve();
      };
      transcriber.push({ wav: encode('slow'), source: 'system' });
      transcriber.push({ wav: encode('fast'), source: 'system' });
    });

    expect(results).toEqual(['slow', 'fast']);
  });

  it('surfaces per-segment errors and continues with the next segment', async () => {
    const texts: string[] = [];
    const errors: string[] = [];
    const transcriber = new SegmentTranscriber({
      onText: (e) => texts.push(e.text),
      onError: (e) => errors.push(e.message),
    });

    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('whisper boom')));
    fetchMock.mockImplementationOnce(() => okResponse('after error'));

    await new Promise<void>((resolve) => {
      transcriber.onText = (e) => {
        texts.push(e.text);
        if (texts.length === 1) resolve();
      };
      transcriber.push({ wav: encode('boom segment'), source: 'system' });
      transcriber.push({ wav: encode('after error segment'), source: 'system' });
    });

    expect(errors).toEqual(['whisper boom']);
    expect(texts).toEqual(['after error']);
  });

  it('does not emit empty transcriptions', async () => {
    const texts: string[] = [];
    const transcriber = new SegmentTranscriber({ onText: (e) => texts.push(e.text) });

    fetchMock.mockImplementationOnce(() => okResponse('   '));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(texts).toEqual([]);
    expect(transcriber.pending).toBe(0);
  });

  it('clear() drops segments still waiting in the queue', async () => {
    const texts: string[] = [];
    const transcriber = new SegmentTranscriber({ onText: (e) => texts.push(e.text) });

    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(okResponse('first')), 40))
    );

    transcriber.push({ wav: encode('first'), source: 'system' });
    transcriber.push({ wav: encode('dropped'), source: 'system' });
    expect(transcriber.pending).toBe(1);

    transcriber.clear();
    expect(transcriber.pending).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(texts).toEqual(['first']);
  });

  it('ignores pushes after dispose()', async () => {
    const texts: string[] = [];
    const transcriber = new SegmentTranscriber({ onText: (e) => texts.push(e.text) });

    transcriber.dispose();
    transcriber.push({ wav: encode('ignored'), source: 'system' });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(texts).toEqual([]);
  });
});