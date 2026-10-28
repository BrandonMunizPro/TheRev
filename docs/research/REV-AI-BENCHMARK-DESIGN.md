# REV AI BENCHMARK DESIGN (UPDATED)

**Document ID:** REV-AI-BENCHMARK-DESIGN-002  
**Status:** Design Only - No Execution  
**Date:** 2026-10-27  
**Author:** Principal AI Architect - The Rev Research

---

## Updates from Correction
- Focus on fair comparison including current Mistral config
- Emphasize agentic/tool use over general benchmarks
- Gaming tests must include frame-time percentiles
- Account for model-specific prompt templates
- Separate estimates from measurements

---

## 1. Establish Baseline First
**Must inspect repository to find:**
- Current Mistral model name/tag
- Quantization
- Temperature, top_p, other settings
- Context size
- System prompts
- Integration path

From codebase scan: `mistral:latest` referenced in OllamaServiceManager, OllamaRepairService. OllamaAdapter defaults to `llama3` but may be overridden.

---

## 2. Test Matrix
| Category | Models | Priority |
|----------|--------|----------|
| **Baseline** | Current configured model (find exact) | P0 |
| **Desktop** | Qwen2.5-7B, Qwen2.5-3B, SmolLM2-3.2B | P0 |
| **Gaming** | Same 3B models with constrained settings | P0 |

---

## 3. Browser Automation Tests (Critical)
- Navigate and extract info
- Multi-step task (e.g., search, find result, summarize)
- Form interaction
- Error recovery
- Must verify actual success, not just plan

---

## 4. Gaming Tests
- Valid JSON action generation
- Context-aware decisions
- Character consistency
- **FPS impact, 1%/0.1% lows, frame times**

---

## 5. Pass/Fail Criteria
Model replaces current only if:
- Browser task success > baseline
- Instruction following better
- Tool calling reliability >= 95%
- Gaming mode doesn't drop below acceptable FPS
- No regressions
- VRAM within safe limits

---

**No execution - design only.**
