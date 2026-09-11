// AudioCaptureService.js
// Acquires an audio stream from either system audio loopback (getDisplayMedia
// with `audio: 'loopback'`, handled by the Electron main process) or the
// microphone (getUserMedia), then runs Voice Activity Detection to split the
// continuous stream into phrase-sized 16kHz mono WAV segments.
//
// Segments are handed to `onSegment({ wav, durationMs, source })`; lifecycle
// events go to `onState` and failures to `onError`. No audio is persisted.

const DEFAULT_SERVER_URL = 'http://127.0.0.1:3001';

class AudioCaptureService {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || DEFAULT_SERVER_URL;

    this.onSegment = options.onSegment || null;
    this.onState = options.onState || null;
    this.onError = options.onError || null;
    this.onActivity = options.onActivity || null;

    this.source = null;
    this.isRunning = false;

    this._phraseSilenceMs = options.phraseSilenceMs ?? 450;
    this._minPhraseMs = options.minPhraseMs ?? 600;
    this._maxPhraseMs = options.maxPhraseMs ?? 12000;
    this._silenceThreshold = options.silenceThreshold ?? 0.02;

    this._mediaStream = null;
    this._audioContext = null;
    this._analyser = null;
    this._scriptProcessor = null;
    this._vadCheckInterval = null;

    this._phraseChunks = [];
    this._phraseStartTime = 0;
    this._lastVoiceTime = 0;
  }

  async start(source = 'system') {
    if (this.isRunning) return;
    this.source = source;

    const stream = await this._acquireStream(source);

    this._phraseChunks = [];
    this._phraseStartTime = Date.now();
    this._lastVoiceTime = Date.now();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this._audioContext = new AudioContextClass({ sampleRate: 16000 });

    const sourceNode = this._audioContext.createMediaStreamSource(stream);
    this._analyser = this._audioContext.createAnalyser();
    this._analyser.fftSize = 256;
    sourceNode.connect(this._analyser);

    const processor = this._audioContext.createScriptProcessor(4096, 1, 1);
    const self = this;

    processor.onaudioprocess = (event) => {
      if (!self.isRunning) return;

      const inputData = event.inputBuffer.getChannelData(0);

      let energy = 0;
      for (let i = 0; i < inputData.length; i++) {
        energy += inputData[i] * inputData[i];
      }
      energy = Math.sqrt(energy / inputData.length);

      if (energy > self._silenceThreshold) {
        self._lastVoiceTime = Date.now();
        if (self.onActivity) self.onActivity(true);
      } else if (self.onActivity) {
        self.onActivity(false);
      }

      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      self._phraseChunks.push(pcmData);
    };

    sourceNode.connect(processor);
    processor.connect(this._audioContext.destination);
    this._scriptProcessor = processor;
    this._mediaStream = stream;

    this.isRunning = true;
    this._startVADCheck();

    if (this.onState) this.onState('listening');
    return true;
  }

  async _acquireStream(source) {
    if (source === 'microphone') {
      const constraints = {
        audio: {
          sampleRate: 16000,
          sampleSize: 16,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };
      return navigator.mediaDevices.getUserMedia(constraints);
    }

    if (source === 'system') {
      const support = window.electronAPI && window.electronAPI.getSystemAudioSupport
        ? await window.electronAPI.getSystemAudioSupport()
        : null;

      if (support && !support.loopbackSupported) {
        const err = new Error('System audio capture is not supported on this platform');
        err.code = 'system-audio-unsupported';
        throw err;
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // We only need the audio loopback - drop the video track immediately.
      displayStream.getVideoTracks().forEach((track) => track.stop());

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((track) => track.stop());
        const err = new Error('No system audio track was captured');
        err.code = 'system-audio-unavailable';
        throw err;
      }

      return new MediaStream(audioTracks);
    }

    throw new Error(`Unknown audio source: ${source}`);
  }

  _startVADCheck() {
    this._vadCheckInterval = setInterval(() => {
      if (!this.isRunning) return;

      const phraseDuration = Date.now() - this._phraseStartTime;
      const silenceTime = Date.now() - this._lastVoiceTime;
      const hasAudio = this._phraseChunks.length > 0;

      if (
        hasAudio &&
        (silenceTime >= this._phraseSilenceMs || phraseDuration >= this._maxPhraseMs)
      ) {
        this._flushPhrase(phraseDuration);
      }
    }, 200);
  }

  _flushPhrase(phraseDuration) {
    let totalLength = 0;
    for (const chunk of this._phraseChunks) {
      totalLength += chunk.length;
    }

    const combined = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of this._phraseChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    this._phraseChunks = [];
    this._phraseStartTime = Date.now();
    this._lastVoiceTime = Date.now();

    const durationMs = phraseDuration || Math.round(totalLength / 16000) * 1000;

    if (durationMs >= this._minPhraseMs && totalLength > 0) {
      const wav = this._createWav(combined, 16000);
      if (this.onSegment) {
        this.onSegment({ wav, durationMs, source: this.source });
      }
    }
  }

  _createWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this._writeString(view, 8, 'WAVE');
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    this._writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(offset, samples[i], true);
      offset += 2;
    }

    return new Uint8Array(buffer);
  }

  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  stop() {
    this.isRunning = false;

    if (this._vadCheckInterval) {
      clearInterval(this._vadCheckInterval);
      this._vadCheckInterval = null;
    }

    try {
      if (this._scriptProcessor) {
        this._scriptProcessor.disconnect();
        this._scriptProcessor = null;
      }
      if (this._analyser) {
        this._analyser.disconnect();
        this._analyser = null;
      }
    } catch (err) {
      console.warn('[Copilot] Audio node disconnect failed:', err);
    }

    const context = this._audioContext;
    this._audioContext = null;
    if (context && typeof context.close === 'function') {
      context.close().catch((err) => {
        console.warn('[Copilot] AudioContext close failed:', err);
      });
    }

    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach((track) => track.stop());
      this._mediaStream = null;
    }

    this._phraseChunks = [];
    this.source = null;

    if (this.onState) this.onState('stopped');
  }

  dispose() {
    this.stop();
    this.onSegment = null;
    this.onState = null;
    this.onError = null;
    this.onActivity = null;
  }
}

export { AudioCaptureService };