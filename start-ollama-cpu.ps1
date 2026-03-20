$env:CUDA_VISIBLE_DEVICES = ""
$env:OLLAMA_GPU_OVERRIDE = "0"
Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
Write-Host "Ollama started in CPU-only mode"
