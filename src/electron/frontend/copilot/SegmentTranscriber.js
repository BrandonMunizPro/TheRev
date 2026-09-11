// SegmentTranscriber.js
// Serial, FIFO transcription queue that sends phrase-sized WAV segments to the
// local Whisper STT server. whisper-node is batch-only, so every completed
// segment is emitted as a final event. Results never leave the local machine.

class SegmentTranscriber {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'http://127.0.0.1:3001';
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.onText = options.onText || null;
    this.onError = options.onError || null;

    this._queue = [];
    this._processing = false;
    this._destroyed = false;
  }

  push(segment) {
    if (this._destroyed || !segment || !segment.wav) return;
    this._queue.push(segment);
    this._processNext();
  }

  async _processNext() {
    if (this._destroyed || this._processing) return;
    if (this._queue.length === 0) return;

    this._processing = true;
    const segment = this._queue.shift();

    try {
      const response = await fetch(`${this.serverUrl}/transcribe`, {
        method: 'POST',
        body: segment.wav,
        headers: { 'Content-Type': 'audio/wav' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Transcription server error: ${response.status}`);
      }

      const result = await response.json();
      const text = result && result.text ? String(result.text).trim() : '';

      if (text && this.onText) {
        this.onText({ text, source: segment.source, isFinal: true, durationMs: segment.durationMs });
      }
    } catch (err) {
      console.error('[Copilot] Segment transcription failed:', err);
      if (this.onError) this.onError(err);
    } finally {
      this._processing = false;
      if (!this._destroyed) this._processNext();
    }
  }

  clear() {
    this._queue = [];
  }

  get pending() {
    return this._queue.length;
  }

  get processing() {
    return this._processing;
  }

  dispose() {
    this._destroyed = true;
    this._queue = [];
  }
}

export { SegmentTranscriber };