# EXECUTIVE REPORT - Rev AI Model Research Correction

**Date:** 2026-10-27  
**Status:** Research Complete - Awaiting Approval  
**No code changes made**

---

## Which three modern local models deserve our first benchmark on the RTX 3060?

**Desktop Candidates (in order to test):**
1. **Qwen2.5-7B-Instruct (GGUF 4-bit)** - Best balance if VRAM allows (~4.7GB). Need to verify vs newer models.
2. **Qwen2.5-3B-Instruct (GGUF 4-bit)** - Better intelligence-to-memory ratio candidate (~2GB). May outperform expectations.
3. **SmolLM2-3.2B-Instruct (GGUF 4-bit)** - Very efficient, good instruction following (~2GB). Tool calling needs verification.

**Gaming Candidates:**
1. **SmolLM2-3.2B** (constrained context) - Prioritize efficiency
2. **Qwen2.5-3B** (constrained) - Better quality if performance allows
3. **Llama-3.2-3B** (fallback) - If others have issues

*All marked as ESTIMATED - need actual testing.*

## Key Findings

### Most promising for browser automation
**Qwen2.5-7B** if it fits with headroom, otherwise **Qwen2.5-3B**. Tool calling reliability is critical and must be tested - a model with great chat but bad function calling is useless for browser automation.

### Most promising for gaming
**SmolLM2-3.2B** - prioritize leaving VRAM for the game. Must test FPS/frame-time impact, not just model performance.

### Should Qwen2.5 recommendation change?
**Yes - don't commit to it yet.** It may still be good, but 3B models might offer better intelligence-to-memory ratio. The previous recommendation was reasonable but not validated against current options or our specific constraints.

### What must be measured before implementation?
- Actual VRAM usage with KV cache at different contexts
- Tool calling success rate on browser tasks
- Browser task completion rate vs current Mistral
- Gaming FPS impact (including 1%/0.1% lows)
- Instruction following improvement
- First token latency

### Licensing or runtime blockers?
- **Licenses:** Qwen2.5 Apache 2.0 (good), SmolLM2 Apache 2.0 (good), Llama 3.2 has community license (needs review). All need verification.
- **Runtime:** Existing Ollama infrastructure is **sufficient**. No need to replace it.

### Is existing Ollama infrastructure sufficient?
**Yes.** Ollama supports GGUF models, CUDA, streaming, tool calling. No compelling reason to switch. Can add llama.cpp later if needed.

## Critical Notes
- **No live web browsing done** - model landscape may have newer releases (Qwen3 family etc.) that I couldn't verify
- **All performance claims are estimates** - must benchmark on actual hardware
- **No code changes made** - research only
- **Cloud providers untouched** - all preserved
- **Fine-tuning not recommended** - architecture improvements first, not feasible for useful model sizes on 6GB VRAM

**NEXT STEP:** Get approval to run benchmarks using the designed test suite. Do not implement until results show improvement.
