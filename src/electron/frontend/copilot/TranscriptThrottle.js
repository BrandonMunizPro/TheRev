// TranscriptThrottle.js
// Coalesces and de-duplicates transcription events feeding the Technical Copilot.
//
// Semantics:
//   - Partial events ({ isFinal: false }) are folded into a pending buffer. The
//     latest revised text is emitted after `partialDelayMs`, and identical
//     revisions are suppressed so revving partials do not spam the consumer.
//   - Final events ({ isFinal: true }) flush immediately without waiting for the
//     throttle window.
//   - A repeated event identical to the last emitted one is dropped
//     (`dedupeWindowMs` guards against collapsing legitimately repeated phrases
//     that arrive far apart in time).
//   - Empty text is ignored.

class TranscriptThrottle {
  constructor(options = {}) {
    this.partialDelayMs = options.partialDelayMs ?? 450;
    this.dedupeWindowMs = options.dedupeWindowMs ?? 5000;
    this.onEmit = options.onEmit || null;

    this._pending = null;
    this._timer = null;
    this._lastEmittedKey = null;
    this._lastEmittedAt = 0;
  }

  push(event) {
    if (!event || !event.text) return;

    const text = String(event.text).trim();
    if (!text) return;

    const arrivedAt = Date.now();

    if (event.isFinal) {
      this._cancelTimer();
      this._clearPending();
      if (this._isDuplicate(text)) return;
      this._emit({ text, source: event.source, isFinal: true, correlationId: event.correlationId, arrivedAt });
      return;
    }

    // Partial revision
    if (this._isDuplicate(text)) {
      this._clearPending();
      return;
    }

    const pendingKey = this._pending ? this._pending._key : null;
    if (pendingKey !== null && pendingKey === this._keyFor(text)) {
      // Same text already pending - no-op.
      return;
    }

    this._pending = { text, source: event.source, isFinal: false, correlationId: event.correlationId, arrivedAt, _key: this._keyFor(text) };
    this._schedulePartial();
  }

  flush() {
    this._cancelTimer();
    const pending = this._pending;
    this._clearPending();
    if (!pending) return;
    if (this._isDuplicate(pending.text)) return;
    this._emit({ text: pending.text, source: pending.source, isFinal: pending.isFinal, correlationId: pending.correlationId, arrivedAt: pending.arrivedAt });
  }

  dispose() {
    this._cancelTimer();
    this._clearPending();
    this.onEmit = null;
  }

  get pendingText() {
    return this._pending ? this._pending.text : '';
  }

  _schedulePartial() {
    this._cancelTimer();
    this._timer = setTimeout(() => this.flush(), this.partialDelayMs);
  }

  _cancelTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _clearPending() {
    this._pending = null;
  }

  _emit(event) {
    this._lastEmittedKey = this._keyFor(event.text);
    this._lastEmittedAt = Date.now();
    const forwarded = { ...event };
    if (forwarded.arrivedAt !== undefined) {
      forwarded.throttleLatencyMs = this._lastEmittedAt - forwarded.arrivedAt;
      delete forwarded.arrivedAt;
    }
    if (this.onEmit) this.onEmit(forwarded);
  }

  _isDuplicate(text) {
    if (this._lastEmittedKey === null) return false;
    if (Date.now() - this._lastEmittedAt > this.dedupeWindowMs) return false;
    return this._keyFor(text) === this._lastEmittedKey;
  }

  _keyFor(text) {
    return String(text)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:]+$/g, '');
  }
}

export { TranscriptThrottle };