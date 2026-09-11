// SegmentTranscriber.js
// Serial, FIFO transcription queue that sends phrase-sized WAV segments to the
// local Whisper STT server. whisper-node is batch-only, so every completed
// segment is emitted as a final event. Results never leave the local machine.
//
// Backpressure: whisper-node cannot be interrupted mid-inference, so sustained
// speech can outpace transcription. The queue is bounded by `maxQueueDepth`;
// when it is full, the oldest not-yet-sent segment is dropped and the newest is
// kept (stale content is worthless, fresh content is not). The in-flight segment
// is never touched. Every dropped segment is counted for dev diagnostics.

class SegmentTranscriber {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'http://127.0.0.1:3001';
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.maxQueueDepth = options.maxQueueDepth ?? 6;
    this.devTrace = options.devTrace || false;
    this.onText = options.onText || null;
    this.onError = options.onError || null;

    this._queue = [];
    this._processing = false;
    this._destroyed = false;

    this._droppedCount = 0;
    this._processedCount = 0;
    this._seq = 0;
  }

  push(segment) {
    if (this._destroyed || !segment || !segment.wav) return;

    const entry = {
      wav: segment.wav,
      durationMs: segment.durationMs || 0,
      source: segment.source,
      capturedAt: segment.capturedAt || Date.now(),
      correlationId:
        segment.correlationId || `seg-${Date.now()}-${this._seq++}`,
      enqueuedAt: Date.now(),
    };

    if (this._queue.length >= this.maxQueueDepth) {
      const victim = this._queue.shift();
      this._droppedCount += 1;
      if (this.devTrace) {
        console.warn(
          `[TranscribeTrace] dropped ${victim.correlationId} (queue full at ${this.maxQueueDepth}, dropped=${this._droppedCount})`
        );
      }
    }

    this._queue.push(entry);
    this._processNext();
  }

  async _processNext() {
    if (this._destroyed || this._processing) return;
    if (this._queue.length === 0) return;

    this._processing = true;
    const entry = this._queue.shift();
    entry.processingStartedAt = Date.now();

    const waitMs = entry.processingStartedAt - entry.enqueuedAt;
    const whisperStartedAt = Date.now();

    try {
      const response = await fetch(`${this.serverUrl}/transcribe`, {
        method: 'POST',
        body: entry.wav,
        headers: { 'Content-Type': 'audio/wav' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Transcription server error: ${response.status}`);
      }

      const result = await response.json();
      const text = result && result.text ? String(result.text).trim() : '';
      const whisperMs = Date.now() - whisperStartedAt;
      const totalLatencyMs = Date.now() - entry.capturedAt;

      this._processedCount += 1;

      if (text && this.onText) {
        this.onText({
          text,
          source: entry.source,
          isFinal: true,
          durationMs: entry.durationMs,
          correlationId: entry.correlationId,
          queueWaitMs: waitMs,
          whisperMs,
          totalLatencyMs,
          capturedAt: entry.capturedAt,
        });
      }

      if (this.devTrace) {
        console.log(
          `[TranscribeTrace] ${entry.correlationId} queued=${waitMs}ms whisper=${whisperMs}ms total=${totalLatencyMs}ms depth=${this._queue.length} dropped=${this._droppedCount}` +
            (text ? '' : ' (empty)')
        );
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

  get queueDepth() {
    return this._queue.length;
  }

  get processing() {
    return this._processing;
  }

  get droppedCount() {
    return this._droppedCount;
  }

  get processedCount() {
    return this._processedCount;
  }

  dispose() {
    this._destroyed = true;
    this._queue = [];
  }
}

export { SegmentTranscriber };