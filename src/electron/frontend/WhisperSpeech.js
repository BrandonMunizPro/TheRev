// WhisperSpeech.js - Local Whisper STT client
// Voice Activity Detection + auto-stop when user stops speaking

const STT_SERVER_URL = 'http://localhost:3001';

class WhisperSpeech {
  constructor() {
    this.audioContext = null;
    this.isListening = false;
    this.onResult = null;
    this.onError = null;
    this.onReady = null;
    this.onProgress = null;
    this._mediaStream = null;
    this._audioChunks = [];
    this._scriptProcessor = null;
    this._analyser = null;
    this._modelLoaded = false;
    this._recordingStartTime = 0;
    this._lastSoundTime = 0;
    this._silenceTimeout = null;
    this._minRecordingTime = 1000; // Minimum 1 second (reduced from 1.5s)
    this._silenceThreshold = 0.015; // Audio level threshold for silence
    this._silenceDuration = 1500; // Stop after 1.5 seconds of silence (reduced from 2s)
    this._vadCheckInterval = null;
    this._serverUrl = 'http://127.0.0.1:3001';
  }

  async _checkServer() {
    try {
      const response = await fetch(`${this._serverUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const data = await response.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  async init() {
    console.log('[Voice] Checking local STT server...');

    try {
      if (window.electronAPI && window.electronAPI.checkSTTStatus) {
        const status = await window.electronAPI.checkSTTStatus();
        if (!status.available) {
          this._modelLoaded = false;
          return false;
        }
        this._modelLoaded = status.modelLoaded;
      } else {
        const available = await this._checkServer();
        if (!available) {
          this._modelLoaded = false;
          return false;
        }
        this._modelLoaded = true;
      }

      console.log('[Voice] Local Whisper STT ready!');
      if (this.onReady) this.onReady();
      return true;
    } catch (err) {
      console.error('[Voice] Failed to initialize:', err);
      if (this.onError) this.onError(err);
      return false;
    }
  }

  async start() {
    if (this.isListening) {
      console.log('[Voice] Already listening');
      return;
    }

    if (!this._modelLoaded) {
      const success = await this.init();
      if (!success) {
        throw new Error('Local STT server not available');
      }
    }

    this._audioChunks = [];
    this._recordingStartTime = Date.now();
    this._lastSoundTime = Date.now();

    try {
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

      this._mediaStream =
        await navigator.mediaDevices.getUserMedia(constraints);

      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });

      const source = this.audioContext.createMediaStreamSource(
        this._mediaStream
      );

      // Create analyser for VAD
      this._analyser = this.audioContext.createAnalyser();
      this._analyser.fftSize = 256;
      source.connect(this._analyser);

      const scriptProcessor = this.audioContext.createScriptProcessor(
        4096,
        1,
        1
      );

      const self = this;
      let totalEnergy = 0;
      let energyCount = 0;

      scriptProcessor.onaudioprocess = (event) => {
        if (!self.isListening) return;

        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Calculate audio energy for VAD
        let energy = 0;
        for (let i = 0; i < inputData.length; i++) {
          energy += inputData[i] * inputData[i];
        }
        energy = Math.sqrt(energy / inputData.length);
        totalEnergy += energy;
        energyCount++;

        // Update last sound time if above threshold
        if (energy > self._silenceThreshold) {
          self._lastSoundTime = Date.now();
        }

        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        self._audioChunks.push(pcmData);
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(this.audioContext.destination);
      this._scriptProcessor = scriptProcessor;

      // Start VAD check
      this._startVADCheck();

      this.isListening = true;
      console.log('[Voice] Started listening');
      return true;
    } catch (err) {
      console.error('[Voice] Failed to start:', err);
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  _startVADCheck() {
    // Check for silence every 200ms
    this._vadCheckInterval = setInterval(() => {
      if (!this.isListening) return;

      const silenceTime = Date.now() - this._lastSoundTime;
      const recordingTime = Date.now() - this._recordingStartTime;

      // Stop if: has been silent for > silenceDuration AND minimum recording time passed
      if (
        silenceTime > this._silenceDuration &&
        recordingTime > this._minRecordingTime
      ) {
        console.log('[Voice] Silence detected, stopping...');
        this.stop();
      }
    }, 200);
  }

  async stop() {
    if (!this.isListening) return;

    this.isListening = false;

    // Stop VAD check
    if (this._vadCheckInterval) {
      clearInterval(this._vadCheckInterval);
      this._vadCheckInterval = null;
    }
    if (this._silenceTimeout) {
      clearTimeout(this._silenceTimeout);
      this._silenceTimeout = null;
    }

    const recordingDuration = Date.now() - this._recordingStartTime;
    console.log(
      '[Voice] Stopped listening, processing audio... (recorded for',
      recordingDuration,
      'ms)'
    );

    try {
      if (this._scriptProcessor) {
        this._scriptProcessor.disconnect();
        this._scriptProcessor = null;
      }

      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      if (this._mediaStream) {
        this._mediaStream.getTracks().forEach((track) => track.stop());
        this._mediaStream = null;
      }

      if (this._audioChunks.length > 0) {
        await this._transcribeAudio();
      } else {
        console.log('[Voice] No audio recorded');
      }
    } catch (err) {
      console.error('[Voice] Error in stop:', err);
      if (this.onError) this.onError(err);
    }
  }

  async _transcribeAudio() {
    if (this._audioChunks.length === 0) {
      console.log('[Voice] No audio to transcribe');
      return;
    }

    try {
      console.log('[Voice] Combining', this._audioChunks.length, 'chunks...');

      let totalLength = 0;
      for (const chunk of this._audioChunks) {
        totalLength += chunk.length;
      }

      const combined = new Int16Array(totalLength);
      let offset = 0;
      for (const chunk of this._audioChunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert to WAV format
      const wavBuffer = this._createWav(combined, 16000);

      console.log('[Voice] Sending to local STT server...');
      console.log(
        '[Voice] Audio duration:',
        (totalLength / 16000).toFixed(2),
        'seconds'
      );

      if (this.onResult) {
        this.onResult({
          transcript: '',
          isFinal: false,
          status: 'transcribing',
        });
      }

      const response = await fetch(`${this._serverUrl}/transcribe`, {
        method: 'POST',
        body: wavBuffer,
        headers: {
          'Content-Type': 'audio/wav',
        },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[Voice] Transcription result:', result.text);

      if (this.onResult) {
        this.onResult({
          transcript: result.text || '',
          isFinal: true,
          confidence: 0.9,
        });
      }

      this._audioChunks = [];
    } catch (err) {
      console.error('[Voice] Transcription error:', err);
      if (this.onError) this.onError(err);
    }
  }

  _createWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF header
    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this._writeString(view, 8, 'WAVE');

    // fmt chunk
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);

    // data chunk
    this._writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write samples
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

  isReady() {
    return this._modelLoaded;
  }

  getProgress() {
    return 100;
  }

  destroy() {
    this.stop();
    this._modelLoaded = false;
  }
}

export { WhisperSpeech };
