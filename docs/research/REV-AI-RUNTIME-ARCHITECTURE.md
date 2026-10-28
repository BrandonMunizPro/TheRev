# REV AI RUNTIME ARCHITECTURE

**Document ID:** REV-AI-RUNTIME-ARCHITECTURE-001  
**Status:** Architecture Design  
**Date:** 2026-10-27  
**Author:** Principal AI Architect - The Rev Research

---

## Executive Summary

Design a `RevAIRuntime` abstraction that manages local inference while preserving full compatibility with existing cloud providers. Support desktop and gaming modes with different resource constraints.

---

## 1. Design Goals

- **Unified interface** - Hide Ollama/llama.cpp details from rest of app
- **Cloud compatible** - Never break existing adapter system
- **Resource aware** - Detect GPU/RAM, adapt to constraints
- **Dual mode** - Desktop (quality) vs Gaming (performance)
- **Resilient** - Auto-recovery, graceful degradation
- **Offline capable** - Works without internet
- **Extensible** - Easy to add backends

---

## 2. Current State Analysis

### Existing Infrastructure (Reusable)
- `OllamaServiceManager` (507 lines) - start/stop, health, GPU strategies
- `OllamaRepairService` (613 lines) - auto-repair
- `OllamaAdapter` - implements AIAdapter interface
- `adapterFactory` - registers adapters
- `SmartFallbackService` - routing with fallbacks
- `AIProvider` enum includes `OPEN_SOURCE` for Ollama

**Must preserve:** All of this continues to work. Cloud providers (ChatGPT, Claude, Gemini, Perplexity) unchanged.

---

## 3. RevAIRuntime Abstraction

### Core Interface
```typescript
interface RevAIRuntime {
  // Lifecycle
  initialize(config: RevAIRuntimeConfig): Promise<void>;
  start(): Promise<boolean>;
  stop(): Promise<void>;
  
  // Model management
  getAvailableModels(): Promise<ModelInfo[]>;
  loadModel(modelId: string): Promise<boolean>;
  unloadModel(): Promise<void>;
  getRecommendedModel(profile: 'desktop' | 'gaming'): Promise<ModelInfo | null>;
  
  // Inference
  complete(request: AIRequest): Promise<AIResponse>;
  stream(request: AIRequest, onChunk): Promise<AIResponse>;
  
  // Resource management
  getResourceUsage(): Promise<ResourceUsage>;
  setProfile(profile: 'desktop' | 'gaming'): Promise<void>;
  canRunModel(modelId: string): Promise<boolean>;
  
  // Health
  isHealthy(): Promise<boolean>;
  diagnose(): Promise<DiagnosticResult>;
}
```

### Backend Support
- **Primary:** Ollama (via existing OllamaServiceManager)
- **Fallback:** llama.cpp/llama-server
- **Future:** Others if needed

---

## 4. Desktop vs Gaming Modes

### Desktop Mode
- **Priority:** Quality, reasoning, instruction following
- **Model:** Larger if available (e.g., Qwen2.5-7B 4-bit)
- **Context:** Larger (up to model limit)
- **Concurrent requests:** Allowed
- **Background tasks:** Can run
- **Use cases:** Browser automation, assistant, general chat

### Gaming Mode  
- **Priority:** Low latency, minimal resource usage, don't impact FPS
- **Model:** Smaller (e.g., Qwen2.5-3B 4-bit, SmolLM2-3.2B)
- **Context:** Reduced
- **Concurrent requests:** Limited/throttled
- **Background tasks:** Paused or skipped
- **Use cases:** Game NPC dialogue only when necessary
- **Triggers:** Game session active, high GPU usage detected

### Mode Switching
- Auto-detect: If game running + high GPU usage → gaming mode
- Manual override in settings
- Per-game profiles
- Seamless switching where possible

---

## 5. Resource Management

### Hardware Detection
- GPU: vendor, model, VRAM (total/available)
- RAM: total/available
- CPU: cores/threads
- Platform

### Resource Monitoring
- Track VRAM usage by Rev AI
- Track system RAM
- Monitor if game is using GPU heavily
- Throttle if resources constrained

### Model Selection Logic
```typescript
function selectModel(profile: 'desktop' | 'gaming', resources: Resources): Model {
  if (profile === 'gaming') {
    // Prefer smallest viable model
    return findSmallestCapableModel(resources.availableVRAM);
  } else {
    // Prefer best quality that fits
    return findBestFitModel(resources.availableVRAM);
  }
}
```

### Graceful Degradation
1. Try preferred model
2. If OOM/out of memory → try smaller quant
3. If still fails → try smaller model
4. If fails → disable local AI, suggest cloud or smaller setup

---

## 6. Integration with Existing Systems

### Adapter System
- Create `RevAIAdapter` that uses `RevAIRuntime`
- Register as provider (maybe replace OPEN_SOURCE usage or add new)
- Keep existing OllamaAdapter working
- SmartFallbackService continues to work

### Intent Classification
- AIIntentClassifier can route to Rev AI
- Browser tasks prefer Rev AI in desktop mode
- Game tasks use gaming profile

### Browser Agent
- Use Rev AI for planning
- Tool calling for actions
- Better context understanding needed

### Game Bridge (Future)
- Game requests go through bridge → Rev AI with gaming profile
- Strict timeouts
- Small model by default

---

## 7. Cloud Provider Compatibility

**CRITICAL:** Must not break existing cloud integrations.

- AdapterFactory still manages all providers
- SmartFallbackService routing unchanged
- User can still configure API keys
- UI for provider settings unchanged
- **Never route local requests to cloud**
- Cloud is only used if explicitly selected
- Rev AI Local is separate from cloud routing

Implementation: Add `REV_AI_LOCAL` as provider option, or make it the default for local while keeping others intact.

---

## 8. Implementation Plan

### Phase 1: Create Abstraction
- Define RevAIRuntime interface
- Create RevAIRuntime class wrapping OllamaServiceManager
- Resource detection utilities

### Phase 2: Mode Management
- Desktop/gaming profiles
- Auto-detection logic
- Model switching

### Phase 3: Integration
- Update adapter system
- Integrate with BrowserAgent
- Prepare for game bridge

### Phase 4: UI/UX
- Hide Ollama branding, show Rev AI
- Mode indicators
- Resource usage display

---

## 9. Recommendations

1. **Start with Ollama backend** - Reuse existing infrastructure
2. **Add llama.cpp as fallback later** - If needed
3. **Keep backward compatible** - Don't break existing setup
4. **Focus on resource awareness** - Critical for RTX 3060 laptop
5. **Make modes work well** - Gaming mode must not tank performance

---

**Next:** See [REV-AI-INTELLIGENCE-IMPROVEMENTS.md](./REV-AI-INTELLIGENCE-IMPROVEMENTS.md)
