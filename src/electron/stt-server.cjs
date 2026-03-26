// stt-server.cjs
// Local Whisper STT Server - runs completely offline
// Auto-downloads model on first run like Ollama
// Uses @lumen-labs-dev/whisper-node with prebuilt Windows binaries

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const PORT = process.env.STT_PORT || 3001;
const MODEL_NAME = 'base.en';

function getWhisperModelPath() {
  return path.join(
    __dirname,
    '..',
    '..',
    'node_modules',
    '@lumen-labs-dev',
    'whisper-node',
    'lib',
    'whisper.cpp',
    'models',
    `ggml-${MODEL_NAME}.bin`
  );
}

function isModelDownloaded() {
  const modelPath = getWhisperModelPath();
  const exists = fs.existsSync(modelPath);
  console.log('[STT] Model exists:', exists, modelPath);
  return exists;
}

async function initWhisper() {
  console.log('[STT] Initializing Whisper...');
  if (isModelDownloaded()) {
    console.log('[STT] Model found, ready!');
    return true;
  }
  console.log('[STT] Model not found!');
  return false;
}

function createWavBuffer(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

async function transcribeAudio(audioBuffer) {
  const { whisper } = require('@lumen-labs-dev/whisper-node');

  const tempFile = path.join(__dirname, `temp_${Date.now()}.wav`);

  // audioBuffer should already be WAV format, but if it's raw PCM, convert it
  fs.writeFileSync(tempFile, audioBuffer);

  try {
    console.log('[STT] Transcribing with model:', MODEL_NAME);
    const result = await whisper(tempFile, {
      modelName: MODEL_NAME,
      whisperOptions: {
        language: 'en',
      },
    });

    try {
      fs.unlinkSync(tempFile);
    } catch (e) {}

    let text = '';
    console.log('[STT] Raw whisper result:', JSON.stringify(result, null, 2));

    if (Array.isArray(result)) {
      console.log('[STT] Result is array with', result.length, 'segments');
      text = result
        .map((r) => r.speech || '')
        .join(' ')
        .trim();
    } else if (result) {
      console.log('[STT] Result type:', typeof result);
      text =
        typeof result === 'string'
          ? result
          : result.text || result.speech || '';
    }

    console.log('[STT] Extracted text:', text);

    return text.trim();
  } catch (err) {
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {}
    console.error('[STT] Transcription error:', err.message);
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/transcribe') {
    console.log('[STT] Received transcription request');

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));

    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        console.log('[STT] Audio size:', buffer.length, 'bytes');

        // Check if it's a valid WAV file
        const riff = buffer.slice(0, 4).toString();
        if (riff !== 'RIFF') {
          console.error('[STT] Invalid audio format - not a WAV file');
          throw new Error('Invalid audio format - expected WAV');
        }

        const wave = buffer.slice(8, 12).toString();
        if (wave !== 'WAVE') {
          console.error('[STT] Invalid audio format - missing WAVE header');
          throw new Error('Invalid audio format - missing WAVE header');
        }

        console.log('[STT] WAV file validated');

        if (!isModelDownloaded()) {
          console.log('[STT] Initializing model...');
          await initWhisper();
        }

        const text = await transcribeAudio(buffer);
        console.log('[STT] Transcription:', text);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: text, segments: [], language: 'en' }));
      } catch (err) {
        console.error('[STT] Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    const downloaded = isModelDownloaded();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        modelDownloaded: downloaded,
        downloadProgress: downloaded ? { status: 'done' } : { status: 'idle' },
      })
    );
  } else if (req.method === 'GET' && req.url === '/download') {
    initWhisper()
      .then(() => res.end(JSON.stringify({ status: 'done' })))
      .catch((err) =>
        res.end(JSON.stringify({ status: 'error', error: err.message }))
      );
  } else if (req.method === 'GET' && req.url === '/warmup') {
    // Pre-warm the model by doing a dummy transcription
    console.log('[STT] Warming up model...');
    const dummyWav = createWavBuffer(new Int16Array(16000), 16000); // 1 second of silence
    try {
      await transcribeAudio(dummyWav);
      res.end(JSON.stringify({ status: 'warmed', model: MODEL_NAME }));
    } catch (err) {
      res.end(JSON.stringify({ status: 'warmup_failed', error: err.message }));
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function start() {
  const modelReady = isModelDownloaded();

  server.listen(PORT, '127.0.0.1', async () => {
    console.log(`[STT] Local STT server running on http://127.0.0.1:${PORT}`);
    console.log(
      '[STT] Model:',
      MODEL_NAME,
      modelReady ? '(~142MB, ready)' : '(NOT FOUND)'
    );

    if (modelReady) {
      // Warm up the model immediately
      setTimeout(async () => {
        try {
          console.log('[STT] Starting warmup...');
          await fetch(`http://localhost:${PORT}/warmup`);
          console.log('[STT] Warmup complete!');
        } catch (err) {
          console.log('[STT] Warmup skipped');
        }
      }, 1000);
    }
  });
}

start();
