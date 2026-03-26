# Download-WhisperModel.ps1
# TheRev uses @lumen-labs-dev/whisper-node for speech recognition
# The base.en model is included with the package

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TheRev - Whisper Speech Recognition" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Current Model: Whisper base.en" -ForegroundColor Yellow
Write-Host "  - Size: ~142 MB (bundled with package)"
Write-Host "  - Speed: Fast transcription"
Write-Host "  - Accuracy: Good for English voice commands"
Write-Host ""

Write-Host "Model Location:" -ForegroundColor Cyan
Write-Host "  node_modules\@lumen-labs-dev\whisper-node\lib\whisper.cpp\models\"
Write-Host ""

Write-Host "To change models, edit src\electron\stt-server.cjs" -ForegroundColor Yellow
Write-Host "Available models: tiny, tiny.en, base, base.en, small, small.en, etc."
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Read-Host "Press Enter to exit"
