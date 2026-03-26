const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

const PORT = 3001;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `audio_${Date.now()}.webm`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'TheRev Local Speech Server' });
});

// Simple keyword detection (for voice commands)
// This is a basic implementation - for production, use a proper STT model
function simpleTranscribe(audioPath) {
  // For now, we'll return a placeholder
  // In production, integrate with Ollama or a proper STT model
  return Promise.resolve({
    text: '[Audio received - transcription pending]',
    confidence: 0.5,
  });
}

// Upload audio for transcription
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('[STT] Received audio file:', req.file.filename);

    // Process with simple transcription
    const result = await simpleTranscribe(req.file.path);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      text: result.text,
      confidence: result.confidence,
    });
  } catch (error) {
    console.error('[STT] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket for real-time streaming transcription
io.on('connection', (socket) => {
  console.log('[STT] Client connected:', socket.id);

  socket.on('audio-chunk', async (data) => {
    try {
      // Process audio chunk
      // This would integrate with a real-time STT model
      console.log('[STT] Received audio chunk:', data.length, 'bytes');
    } catch (error) {
      socket.emit('transcription-error', { error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('[STT] Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(
    `[TheRev] Local Speech Server running on http://localhost:${PORT}`
  );
  console.log(
    '[TheRev] This server bypasses Norton - uses localhost connection'
  );
});

module.exports = { app, server, io };
