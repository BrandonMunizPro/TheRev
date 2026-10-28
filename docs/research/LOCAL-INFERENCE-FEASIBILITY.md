# LOCAL INFERENCE FEASIBILITY

**Document ID:** LOCAL-INFERENCE-FEASIBILITY-001  
**Status:** Research & Analysis  
**Date:** 2026-10-27  
**Author:** Principal Software Architect - The Rev Research

---

## Executive Summary

The Rev has mature Ollama integration already in place. The goal is to make it invisible to users as "Rev AI". Three approaches evaluated: extend Ollama (recommended), bundle/fork Ollama, or build on llama.cpp directly.

**Recommendation:** **Option A (Extend existing Ollama)** as primary, with **Option C (llama.cpp)** as fallback for advanced control/packaging.

---

## 1. Current State Assessment

### Existing Infrastructure (Verified)
- **OllamaAdapter.ts** - Full adapter with streaming, health checks, error handling
- **OllamaServiceManager.ts** (507 lines) - Auto-start with GPU/CPU strategies, health monitoring, model pulling
- **OllamaRepairService.ts** (613 lines) - Auto-repair for CUDA errors, crashes, cache clearing, reinstall
- **adapterFactory** - Manages Ollama as OPEN_SOURCE provider
- **SmartFallbackService** - Routes to Ollama with fallbacks

**Strengths:** Very mature, handles GPU detection, auto-repair, multi-strategy startup
**Gaps:** User still needs Ollama installed manually, visible as "Ollama" in some places, not fully hidden

---

## 2. Implementation Options

### Option A: Extend Existing Ollama Integration (RECOMMENDED PRIMARY)

**Approach:** Wrap OllamaServiceManager in "RevAIRuntime" service, auto-install if missing, hide from UI, manage lifecycle per game session.

| Aspect | Assessment | Notes |
|--------|------------|-------|
| **Ease of Implementation** | ★★★★★ High | 90% already exists |
| **Time to Market** | ★★★★★ Fast | Weeks, not months |
| **Maintenance** | ★★★★☆ Low | Leverage Ollama team's updates |
| **Packaging/Distribution** | ★★★★☆ Moderate | Need to detect/install Ollama or bundle |
| **Control** | ★★★☆☆ Limited | Depend on Ollama's API/behavior |
| **GPU Compatibility** | ★★★★★ Good | Already handled |
| **License** | ★★★★★ MIT - no issues | Ollama is MIT licensed |

**Pros:**
- Minimal code changes, maximum reuse
- Ollama handles complex model management, GGUF, GPU acceleration
- Battle-tested by community
- Easy to update
- Users can still use their existing Ollama if desired

**Cons:**
- Requires Ollama installed (or automated installation)
- Less control over internals
- Some overhead

**Implementation Plan:**
1. Create `RevAIRuntime` service wrapping `ollamaService`
2. Auto-detect/install Ollama on first run (use OllamaRepairService.installOllama)
3. Hide Ollama branding in UI, show as "Rev AI"
4. Start/stop with game sessions
5. Pre-download recommended models
6. Add model management UI under "Rev AI" section

---

### Option B: Fork or Bundle Ollama

**Approach:** Fork Ollama repo, rebrand to "Rev AI", bundle binaries.

| Aspect | Assessment | Notes |
|--------|------------|-------|
| **Ease of Implementation** | ★★☆☆☆ Low | Complex build process |
| **Time to Market** | ★★☆☆☆ Slow | Months of work |
| **Maintenance** | ★☆☆☆☆ Very High | Must track upstream, security patches |
| **Packaging/Distribution** | ★★★★☆ Good once built | Full control |
| **Control** | ★★★★★ Full | Complete control |
| **GPU Compatibility** | ★★★★☆ Good | Can maintain but need expertise |
| **License** | ★★★★★ MIT - allowed to fork/redistribute | Check dependencies |

**Ollama Repo:** https://github.com/ollama/ollama (MIT License)
**Build Process:** Go + llama.cpp, complex cross-compilation

**Pros:**
- Fully integrated, no external dependency
- Complete control over branding/UX
- Can optimize for Rev's use case

**Cons:**
- Massive maintenance burden
- Need Go expertise, CUDA/ROCm/Vulkan knowledge
- Security responsibility
- Will lag behind Ollama updates
- Overkill for current needs

**Recommendation:** **Not recommended** for initial implementation. Only consider if Ollama becomes unmaintained or has blocking issues.

---

### Option C: Build Rev AI Around llama.cpp (FALLBACK)

**Approach:** Use llama.cpp directly as embedded/managed backend. Reference: https://github.com/ggml-org/llama.cpp

| Aspect | Assessment | Notes |
|--------|------------|-------|
| **Ease of Implementation** | ★★★☆☆ Medium | More work than wrapping Ollama |
| **Time to Market** | ★★★☆☆ Medium | 1-2 months |
| **Maintenance** | ★★★☆☆ Medium | Need to manage llama-server updates |
| **Packaging/Distribution** | ★★★★☆ Good | Can bundle llama-server.exe |
| **Control** | ★★★★★ Full | Complete API control |
| **GPU Compatibility** | ★★★★★ Excellent | llama.cpp has best GPU support (CUDA, Vulkan, ROCm, Metal, SYCL) |
| **License** | ★★★★★ MIT | Very permissive |

**llama.cpp Server API:** https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- OpenAI-compatible API
- Supports streaming, JSON mode, tool calling
- Model loading/unloading
- Concurrent requests
- Metrics/health endpoints

**Implementation Plan:**
1. Download/bundle llama-server binary for Windows
2. Create RevLlamaCppManager similar to OllamaServiceManager
3. Implement same interface as OllamaAdapter
4. Handle model downloads (can use HuggingFace, Ollama's model library format compatible)
5. Hardware detection (GPU vendors, VRAM)
6. Graceful startup/shutdown

**Pros:**
- More lightweight than full Ollama
- Better control over server behavior
- Easier to embed
- Active development, cutting edge
- Can strip features not needed

**Cons:**
- Need to reimplement model management, some convenience features
- More code to maintain
- Less user-friendly out of box

**Recommendation:** **Good fallback** if Ollama bundling proves difficult or we need more control.

---

## 3. Recommended Architecture

**Primary:** Option A (Extend Ollama)  
**Fallback:** Option C (llama.cpp) if Option A hits blockers

```
┌─────────────────────────────────────────────────────────┐
│                    Rev AI Runtime                        │
│  (Hides Ollama/llama.cpp, provides unified interface)   │
└─────────────────────────┬─────────────────────────────────┘
                          │
                    ┌─────▼─────┐
                    │  Backend   │  (OllamaServiceManager or LlamaCppManager)
                    │  Selector  │
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │   Ollama   │ or │ llama-server │
                    │   (Primary)│     │  (Fallback)  │
                    └───────────┘     └──────────────┘
```

---

## 4. Model Requirements for Game Interaction

### Evaluation Criteria
| Criteria | Priority | Notes |
|----------|----------|-------|
| **Structured action generation** | P0 | Must reliably output JSON matching game schemas |
| **Function/tool calling reliability** | P0 | Critical for game actions |
| **Following constraints** | P0 | Must respect permissions, available actions |
| **Dialogue quality** | P0 | Character-appropriate responses |
| **Context retention** | P0 | Remember conversation history, game state |
| **Response latency** | P0 | < 2-3 seconds ideally for interactive dialogue |
| **Resource usage** | P0 | Must run alongside games on mid-range hardware |
| **Offline operation** | P0 | No internet required |
| **Commercial redistribution rights** | P0 | Must allow bundling/distribution |
| **Quantization compatibility** | P0 | GGUF GGUF support for smaller sizes |

### Recommended Models (Open Weight)

| Model | Size (GGUF) | Quality | Speed | Tool Use | Notes | License |
|-------|-------------|---------|-------|----------|-------|---------|
| **L3.1-8B/L3.2-3B** | 2-5GB | Good | Fast | Decent | Llama 3.1/3.2, widely tested, good general purpose | Llama 3.1 Community License (check commercial use) |
| **Mistral Small 3.1?** | Varies | Better | Medium | Good | Check latest | Varies |
| **Qwen2.5-7B/14B** | 4-9GB | Very Good | Medium | Excellent | Strong instruction following, tool use, JSON | Apache 2.0 (very permissive) |
| **Gemma 2/3** | 2-9GB | Very Good | Medium-Fast | Good | Google, good quality/size ratio | Gemma Terms of Use |
| **Hermes-2-Pro/L3.1** | 4-5GB | Good | Medium | Excellent | Fine-tuned for function calling | Varies by base |
| **Cogito** | 3-8GB | Good | Medium | Good | Focused on reasoning/dialogue | Apache 2.0 |

**Recommendation for Rev AI Default:** Start with **Qwen2.5-7B GGUF (GGUF)** in 4-bit quantization (~4.7GB) or **L3.2-3B** for lower-end systems (~2GB).

**Critical:** Always verify license for redistribution. Apache 2.0 is safest.

---

## 5. Fine-Tuning Considerations

### When Fine-Tuning Makes Sense
- Generic models struggle with specific game schema consistently
- Need very specific character voices/styles
- Tool calling success rate too low with prompting alone
- Want to reduce context needed

### Approach: LoRA/QLoRA
- **Tools:** LLaMA-Factory, Axolotl, Unsloth
- **Data needed:** Examples of game context → correct actions, character dialogues
- **Hardware:** Needs GPU with 12GB+ VRAM for training
- **Cost:** Time-intensive, not trivial

### Recommendation
**Do NOT fine-tune initially.** First optimize:
1. Prompt engineering with schemas
2. Few-shot examples
3. RAG for game context
4. Structured output enforcement (JSON schema)
5. Function/tool calling with clear schemas

Only consider fine-tuning if benchmarks show prompting+schemas are insufficient after POC.

---

## 6. Hardware Compatibility & Graceful Degradation

### Minimum Requirements
| Tier | CPU | RAM | GPU | VRAM | Recommended Model |
|------|-----|-----|-----|------|-------------------|
| **Low** | Modern 4-core | 8GB | Integrated or none | N/A | L3.2-3B GGUF 4-bit (~2GB) |
| **Mid** | 6-8 core | 16GB | GTX 1660/3060 or equivalent | 6GB+ | Qwen2.5-7B GGUF 4-bit (~4.7GB) |
| **High** | 8+ core | 32GB | RTX 4070+ | 8GB+ | Qwen2.5-14B or larger |

### Degradation Strategy
1. **Auto-detect hardware** on first run
2. **Recommend appropriate model** based on RAM/VRAM
3. **Quantization selection** - offer 2-bit, 3-bit, 4-bit, 5-bit, 6-bit, GGUF
4. **CPU fallback** - still works on CPU (slower)
5. **Context limiting** - reduce context window if memory constrained
6. **Response quality vs speed** - user configurable
7. **Non-AI fallback** - if no model fits, disable AI features gracefully

### Performance Monitoring
- Track tokens/sec, latency, memory usage
- Warn if running low on resources
- Auto-suggest smaller model if struggling
- Pause AI features if game is memory-intensive (optional)

---

## 7. Implementation Recommendations

**Phase 1 (POC):** Extend Ollama
- Create RevAIRuntime wrapper
- Auto-start Ollama, hide UI
- Test with Qwen2.5-7B
- Benchmark against current setup

**Phase 2:** Add llama.cpp fallback
- Bundle llama-server for cases where Ollama can't be installed
- Same interface

**Success Metrics:**
- User doesn't need to install Ollama manually
- Works offline
- Runs on mid-range hardware (16GB RAM)
- Latency acceptable for dialogue (< 3s)
- Structured actions work reliably (>90% success)

---

**Next Steps:** See [GAME-BRIDGE-SDK-DESIGN.md](./GAME-BRIDGE-SDK-DESIGN.md)
