# REV AI MODEL SELECTION DECISION

**Document ID:** REV-AI-MODEL-SELECTION-DECISION-001  
**Status:** Research Decision (No Implementation)  
**Date:** 2026-10-27  
**Author:** Principal AI Architect - The Rev Research  
**Hardware:** Acer Predator Helios, RTX 3060 Laptop (6GB VRAM), ~16GB RAM, Windows, CUDA

---

## Executive Summary

**This corrects the previous recommendation.** Qwen2.5-7B was reasonable at the time of prior research, but the model landscape has evolved. The selection depends heavily on actual testing, as "intelligence-to-memory ratio" matters more than raw benchmark scores for The Rev's use cases.

**CRITICAL:** No model has been benchmarked on our actual hardware yet. All recommendations are evidence-based estimates from public sources and must be verified.

---

## 1. Current State (Verified from Codebase)

| Component | Finding |
|-----------|---------|
| **Default Model** | OllamaAdapter defaults to `llama3`, adapterFactory initializes with `model: 'llama3'` |
| **Mistral References** | Found in OllamaServiceManager defaults (`mistral:latest`), OllamaRepairService core models, instructions - suggests Mistral may have been used/configured |
| **Runtime** | Ollama (MIT) via OllamaServiceManager, OllamaRepairService, OllamaAdapter |
| **Cloud Providers** | OpenAI, Claude, Gemini, Perplexity all implemented and must be preserved |

---

## 2. Three Recommended Desktop Candidates (3B-8B)

*Ranked by estimated intelligence-to-memory ratio for browser automation + general assistance. All require verification.*

| Rank | Model (Exact Name) | Version/Date | Params | Quant (Recommended) | Disk/VRAM Est. | Context | Tool/JSON | License | Confidence | Notes |
|------|---------------------|---------------|--------|---------------------|----------------|---------|-----------|---------|------------|-------|
| **1** | `qwen2.5:7b-instruct` (Ollama tag) / Qwen2.5-7B-Instruct | Qwen2.5 family (Alibaba) - verify exact release | 7B (dense) | GGUF 4-bit | ~4.7GB disk, ~5-5.5GB VRAM (with KV cache) | 32K-128K depending on variant | Strong evidence for tool calling & JSON | **Apache 2.0** (verify exact variant) | **Estimated** - needs testing | Good balance if VRAM allows. Previous rec but needs verification against newer models. |
| **2** | `qwen2.5:3b-instruct` / Qwen2.5-3B-Instruct | Qwen2.5 family | 3B (dense) | GGUF 4-bit | ~2GB disk, ~2.5-3GB VRAM | 32K+ | Good for size, verify tool calling | **Apache 2.0** (verify) | **Estimated** | Better VRAM headroom. May surprise on agentic tasks with good orchestration. |
| **3** | `smollm2:3.2b` / SmolLM2-3.2B-Instruct | HuggingFace SmolLM2 (recent) | 3.2B (dense) | GGUF 4-bit | ~2GB disk, ~2.5-3GB VRAM | Varies | Improving, needs verification for tool calling reliability | **Apache 2.0** (verify) | **Estimated** | Very efficient, good instruction following for size. Tool calling reliability needs testing. |

**Caveats:** 
- "qwen3" family may exist now but needs verification of availability in GGUF/Ollama and actual improvements
- Exact Ollama tags must be verified
- Model landscape changes frequently

---

## 3. Three Recommended Gaming Candidates

*Prioritize VRAM efficiency and low latency over max intelligence.*

| Rank | Model (Exact Name) | Version/Date | Params | Quant (Recommended) | Disk/VRAM Est. | Context | Tool/JSON | License | Confidence | Notes |
|------|---------------------|---------------|--------|---------------------|----------------|---------|-----------|---------|------------|-------|
| **1** | `smollm2:3.2b` | SmolLM2-3.2B | 3.2B | GGUF 4-bit (or IQ2/3-bit if needed) | ~2GB, ~2-2.5GB VRAM | Constrain to 2048-4096 for gaming | Verify | Apache 2.0 (verify) | **Estimated** | Efficiency-focused, likely leaves more VRAM for game |
| **2** | `qwen2.5:3b-instruct` | Qwen2.5-3B | 3B | GGUF 4-bit | ~2GB, ~2.5GB VRAM | Constrain | Verify | Apache 2.0 (verify) | **Estimated** | Good intelligence-to-size ratio |
| **3** | `llama-3.2:3b` (if available) | Llama 3.2 3B | 3B | GGUF 4-bit | ~2GB, ~2.5GB VRAM | Constrain | Verify (often weaker for tools) | Llama Community License (verify terms) | **Estimated** | Fallback option, may have weaker tool calling |

**Note:** Cannot assume 3B runs well alongside all games. Must test with actual games and measure FPS/frame-time.

---

## 4. Verified Licenses & Redistribution

| Model Family | Typical License | Commercial Use | Redistribution | Notes |
|--------------|-----------------|----------------|---------------|-------|
| **Qwen2.5** | Apache 2.0 | Generally yes | Generally yes | Verify exact model card for specific variant |
| **SmolLM2** | Apache 2.0 | Generally yes | Generally yes | Verify |
| **Llama 3.2** | Llama 3.2 Community License | Has terms/conditions | Has terms/conditions | More restrictive than Apache 2.0 - review carefully |
| **Gemma** | Gemma Terms of Use | Varies | Varies | Need careful review |
| **Mistral** | Apache 2.0 for many | Varies by model | Varies by model | Check specific model |

**All must be verified from official model cards before any bundling/redistribution.**

---

## 5. Runtime Compatibility

| Runtime | CUDA/Windows | GGUF | Tool Calling | Structured Output | Offloading | Notes |
|---------|---------------|------|--------------|-------------------|------------|-------|
| **Ollama** (existing) | Yes | Yes | Model-dependent, improving | Supported via API/options | Yes | Already integrated - prefer keeping |
| **llama.cpp/llama-server** | Yes (CUDA) | Yes | Good support | Good support (JSON schema) | Yes, fine-grained control | More control, same models. Only switch if measurable benefit. |
| **Other runtimes** | Varies | Varies | Varies | Varies | Varies | Not recommended without compelling reason |

**Recommendation:** Keep existing Ollama infrastructure. It's sufficient for GGUF models.

---

## 6. Evidence Supporting Shortlist

**Sources to verify (need live checking):**
- Ollama model library: https://ollama.com/library
- HuggingFace model pages for exact model cards
- Official Qwen releases
- Published benchmarks (LMArena, VibeEval, etc.) - treat as directional only
- Community reports on tool calling reliability

**Confidence:** Most items marked as "Estimated" because I cannot browse live internet in this environment to get absolute latest October 27, 2026 data. This is an honest assessment of limitations.

---

## 7. Benchmark Execution Order

1. **Establish baseline** - Document current Mistral config from codebase (done partially), test if possible
2. **Desktop candidates** - Test Qwen2.5-7B, Qwen2.5-3B, SmolLM2-3.2B
3. **Gaming candidates** - Same small models with constrained settings
4. **Compare** - Use benchmark suite from REV-AI-BENCHMARK-DESIGN.md
5. **Decide** - Only after measured results

---

## 8. Criteria for Selecting Final Default

A model can become default only if:
- [ ] Beats current Mistral on instruction following (measured)
- [ ] Beats current Mistral on browser task completion (measured)  
- [ ] Reliable tool calling / valid JSON (>95%)
- [ ] Acceptable latency on hardware
- [ ] Fits in VRAM with headroom for desktop use
- [ ] Gaming mode works acceptably
- [ ] License allows use
- [ ] Works with existing Ollama infrastructure
- [ ] No regression in existing features

---

## 9. Unresolved Questions & Research Limitations

**Limitations:**
- **Live web access** - Could not fetch latest October 27, 2026 model releases in real-time
- **Hardware testing** - No actual benchmarking performed (research only)
- **Exact current model** - Mistral may be configured elsewhere; need to confirm full setup
- **Model availability** - Some newer models may not be in Ollama/GGUF yet

**Unknowns:**
- Are there newer models (Qwen3 family) that are significantly better?
- Exact tool-calling reliability on these specific models
- Real VRAM usage with KV cache at various contexts
- Gaming FPS impact

---

## ANSWERS TO KEY QUESTIONS

### 1. Is Qwen2.5 7B still competitive with newer models?
**Unclear without live data.** Qwen2.5-7B was strong, but newer generations may exist. Needs verification.

### 2. Is there a stronger compact model for our hardware?
**Possibly Qwen2.5-3B or SmolLM2** - better intelligence-to-memory ratio. Needs testing.

### 3. Can a 4B model provide comparable or better practical task performance?
**Potentially yes** with better orchestration. Don't assume 7B is needed.

### 4. Which models have the most reliable tool calling?
**Need testing.** Hermes was historically good for tools, but needs current verification.

### 5. Which model offers the best intelligence-to-memory ratio?
**Likely Qwen2.5-3B or SmolLM2-3.2B** based on patterns, but unverified.

### 6. Which model is best for desktop browser automation?
**Candidate:** Qwen2.5-7B if it fits with headroom, else Qwen2.5-3B. Must test.

### 7. Which model is best for gaming while preserving performance?
**Candidate:** SmolLM2-3.2B or Qwen2.5-3B with constrained context. Must test FPS impact.

### 8. Is there any compelling reason to fine-tune before upgrading the base model?
**No.** Architecture improvements (browser agent, memory, tools) will likely help more and cost nothing. Fine-tuning not feasible on 6GB VRAM for useful sizes.

---

**CONCLUSION:** Qwen2.5-7B recommendation should NOT be blindly kept. Need to test against 3B models. The best model might be smaller with better orchestration. Existing Ollama infrastructure is sufficient. No implementation until approval and benchmarking.
