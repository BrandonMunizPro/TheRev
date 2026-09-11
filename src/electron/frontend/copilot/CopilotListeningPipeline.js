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
      this.transcriber.push({ ...segment, source: this.source });
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