# REV AI LOCAL BENCHMARK RESULTS (UPDATED)

**Document ID:** REV-AI-LOCAL-BENCHMARK-RESULTS-001  
**Status:** Measured Results - No Production Changes  
**Date:** 2026-10-27 (Updated)  
**Hardware:** Acer Predator Helios, NVIDIA RTX 3060 Laptop (6GB VRAM), ~16GB RAM, Windows  
**Runtime:** Ollama (local)

---

## Executive Summary

Tested with additional model due to freed disk space. **qwen2.5:3b** shows competitive performance - better than mistral:latest overall, slightly below llama3.2:3b in average score. Large candidates (qwen3:4b, gemma3:4b, qwen2.5:7b) couldn't be downloaded due to insufficient disk space.

---

## Models Tested

| Model | Tag | Size | ID | Status |
|-------|-----|------|-----|--------|
| llama3.2 | 3b | 2.0 GB | a80c4f17acd5 | Baseline |
| mistral | latest | 4.4 GB | 6577803aa9a0 | Baseline |
| qwen2.5 | 3b | 1.9 GB | 357c53fb659c | Newly tested |

---

## Results Comparison

### Summary (1 trial for qwen2.5, 2 trials for others)
| Model | Tests | Passed | Avg Score | Avg Latency (ms) | Avg Tokens/s |
|-------|-------|--------|-----------|------------------|--------------|
| **llama3.2:3b** | 10 | 7 | 56.0 | 1607 | 100.5 |
| **qwen2.5:3b** | 5 | 4 | 54.0 | 3312 | 70.1 |
| **mistral:latest** | 10 | 6 | 48.0 | 5591 | 27.7 |

### Performance Notes
- **llama3.2:3b**: Fastest (100.5 tok/s), lowest latency, best overall
- **qwen2.5:3b**: Good balance - better than mistral, reasonable speed (70.1 tok/s), smaller than mistral
- **mistral:latest**: Slowest, largest, worst performance

### Task Breakdown (qwen2.5:3b)
- Multi-step reasoning: 70/100 ✓
- Instruction following: 50/100 ✓
- Browser search intent: 60/100 ✓
- Tool selection: 20/100 ✗ (critical weakness)
- NPC dialogue: 70/100 ✓

---

## Recommendations

### Desktop Candidate
**llama3.2:3b** - Best overall performance and speed for responsive UI

### Lightweight Gaming Candidate  
**qwen2.5:3b** - Good alternative if llama3.2 unavailable, uses similar resources (1.9GB), decent speed

### Critical Issue
All models struggle with **tool selection/valid JSON generation** - this is the biggest blocker for browser automation regardless of model choice. Focus on improving orchestration/prompting rather than just swapping models.

---

## Limitations
- Could not download qwen3:4b-instruct, gemma3:4b, qwen2.5:7b-instruct due to disk space (only ~2GB free)
- qwen2.5:3b tested with 1 trial vs 2 for others
- No GPU/CPU detailed metrics
- Small test set

**No production changes made. No automatic model switching. All findings reported as measured.**
