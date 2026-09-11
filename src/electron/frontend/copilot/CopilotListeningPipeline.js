// CopilotListeningPipeline.js
// Orchestrates the live-input path for the Technical Copilot:
//
//   AudioCaptureService --segments--> SegmentTranscriber --text--> TranscriptThrottle --events--> onEvent
//
// Acquisition and transcription are injected so the wiring can be unit-tested
// without touching native media capture. Partials flow through `onEvent`
// (usually rendered live, not submitted); finals should be submitted to the
// copilot session by the consumer.

import { TranscriptThrottle } from './TranscriptThrottle.js';

const SOURCES = ['system', 'microphone'];

class CopilotListeningPipeline {
  constructor(options = {}) {
    this.capture = options.capture;
    this.transcriber = options.transcriber;
    this.throttle = options.throttle || new TranscriptThrottle();
    this.source = SOURCES.includes(options.source) ? options.source : 'system';
    this.onEvent = options.onEvent || null;
    this.onError = options.onError || null;
    this.onState = options.onState || null;

    this.state = 'idle'; // idle | starting | listening | stopped | error
    this._wired = false;
    this._disposed = false;
    this._suppressUntil = 0;
    this._suppressedCount = 0;
  }

  async start(sourceOverride) {
    if (this._disposed) return false;
    if (this.state === 'starting' || this.state === 'listening') return true;

    if (sourceOverride && SOURCES.includes(sourceOverride)) {
      this.source = sourceOverride;
    }

    this._setState('starting');

    if (!this._wired) {
      this._wire();
      this._wired = true;
    }

    try {
      await this.capture.start(this.source);
      this._setState('listening');
      return true;
    } catch (err) {
      this._setState('error');
      if (this.onError) this.onError(err);
      return false;
    }
  }

  _wire() {
    this.capture.onSegment = (segment) => {
      if (this._disposed) return;
      if (this._isSuppressed(segment)) return;
      this.transcriber.push({
        ...segment,
        source: this.source,
        capturedAt: segment.capturedAt || Date.now(),
      });
    };

    this.capture.onError = (err) => {
      if (this.onError) this.onError(err);
    };

    this.transcriber.onText = (event) => {
      if (this._disposed) return;
      this.throttle.push(event);
    };

    this.transcriber.onError = (err) => {
      if (this.onError) this.onError(err);
    };

    this.throttle.onEmit = (event) => {
      if (this.onEvent) this.onEvent(event);
    };
  }

  // Suppresses audio segments that begin inside the window after a copilot cue
  // was rendered. The pipeline listens to system loopback, so the copilot's own
  // cue chime/speech is picked up by the mic-equivalent capture and would
  // otherwise be transcribed back as a fake "prompt" (self-feedback). Visual
  // callers should call suppressUntil(Date.now() + N) right before rendering
  // cue audio.
  suppressUntil(timestamp) {
    if (timestamp > this._suppressUntil) {
      this._suppressUntil = timestamp;
    }
  }

  _isSuppressed(segment) {
    if (this._suppressUntil <= 0) return false;
    const capturedAt = segment.capturedAt || Date.now();
    if (capturedAt < this._suppressUntil) {
      this._suppressedCount += 1;
      return true;
    }
    this._suppressUntil = 0;
    return false;
  }

  get suppressedCount() {
    return this._suppressedCount;
  }

  stop() {
    if (this._disposed) return;
    this.capture.stop();
    this.throttle.flush();
    this.transcriber.clear();
    this._setState('stopped');
  }

  dispose() {
    this._disposed = true;
    this.capture.dispose();
    this.transcriber.dispose();
    this.throttle.dispose();
    this.onEvent = null;
    this.onError = null;
    this.onState = null;
  }

  _setState(state) {
    this.state = state;
    if (this.onState) this.onState(state);
  }
}

export { CopilotListeningPipeline };